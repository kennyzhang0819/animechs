# Animechs

A tower-defense swarm game in Mindustry's clothes: fifty waves of up to
twenty thousand bodies, flow-field pathfinding for the whole horde, WebGL2
instanced rendering, and seventeen turrets (1×1 up to 4×4) that block
movement and reroute the swarm in real time — while the swarm shoots back
at them with Mindustry's own weapons.

## Run

```bash
npm install
npm run dev       # the desktop app: a PRODUCTION build served inside the Electron shell
npm run dev:web   # the same production server, in a bare browser tab
npm run dev:hot   # Next's dev server with hot reload — slow, and not what ships; only when you need it
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
  over them (`TOWER_HP_SCALE`, 5, and plating by footprint, `TOWER_ARMOR_BY_SIZE`; the phase tier's +30% up-gun on
  spectre, meltdown and foreshadow), `MAX_UNITS` (22,000) and the core's
  pool (`CORE_HP`, on a dial of its own). A placement is INSTANT — there
  is no construction shell any more
- `game/levels.ts` — unit stats and wave-script plumbing; the authored
  script itself (50 waves, a 15-second gap — `WAVE_GAP_DEFAULT`) lives in
  `public/levels/campaign.json`, loaded by `loadLevelDocs()`. Six unit
  families, each one idea at five sizes: ground mechs, venom spitters,
  Starhart stags, Stoop bats and the two **naval** lines (the Skate
  mantas, the Livewire eels), which travel on the amphibious water layer. The **family roll**
  (`rollFamilies`, `transformScript`) is what makes one run's swarm differ
  from the next's; `unitDrop` is what a kill pays
- `game/economy.ts` — **the economy**: scrap (in-run money — a kill drops
  a fifteenth of its own health, `SCRAP_PER_HP`, a boss `BOSS_SCRAP` on
  top; **nothing else pays anything** — no wave bonus, no passive
  trickle), XP (meta progress),
  the fixed mission pot and how it is dealt out per wave cleared
  (`MISSION_XP`, `waveXpShare`), **what the corner's three buy buttons
  cost** (`TURRET_ROLL_PRICE` 1,000, `MOD_ROLL_PRICE` 2,000,
  `RELIC_ROLL_PRICE` 150,000, all flat — the run's only outgoings) and the
  **amount ladder** that multiplies them (`BUY_AMOUNTS`: 1 / 4 / 9, flat,
  no bulk discount), the three price bands and
  what a draw in each is WORTH (`TOWER_PRICE` — no longer what a board
  spends), the sell refund (zero), the level curve and the random-map bonus
- `game/ladder.ts` — the **ten-rung ladder** (`RUNGS`: the count scale,
  the mutator roll and the XP bonus each; the enemy-level dial is wired
  and authored to zero), and the audit/check arithmetic over the authored
  script — the **stage table** (`stageAudit`) that the turret prices are
  tuned against
- `game/track.ts` — the **level track**: the roster phase — a fresh save
  owns four turrets (`STARTING_ROSTER`) and four mods (`STARTING_MODS`), and
  the track hands out a turret and a mod a level (`UNLOCKS`, `MOD_UNLOCKS`)
  to a complete mod catalog at 14 and a complete roster at `ROSTER_TOP` —
  then the **late half**, where the mutator phase opens with a whole band
  (`MUTATORS_FROM` = 15) and the **relics** start one level later
  (`RELIC_UNLOCKS`, `RELICS_FROM` = 16), one a level to the top of the track
  at 30, one a level. **Mods across the front, relics across the back**, because the two
  categories are two answers to two halves of a run. Plus
  `techStateFor(level)`, what a save at that level may do. The turret
  upgrade rungs are off the track for now (`UPGRADES_ON_TRACK`) and are not
  a category: nothing deals one and no tab is named for them
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
- `game/mods.ts` — **the MODS**, the first of the game's two categories of
  module and the **mid game's** answer: sixteen of them on the turrets' own
  four rarities, sold off **M** at 2,000, and each one a standing CHANCE on
  every turret placed from then on (`rollTurretMods`, folded into
  `Tower.mods` as a bitmask). A mod has no cap — a copy scales what a turret
  born with it gets — so the M button never runs out. The stat surgery
  (`applyTurretMods`), the odds (`MOD_WEIGHTS`: 52 / 30 / 16 / **2**) and
  the roll chances live here
- `game/relics.ts` — **the RELICS**, the second category and the **late
  game's** answer: fourteen of them, sold off **G** at 150,000, each one a
  RULE over the whole board in force the moment it is paid for. What they
  are for is a swarm of T5 hulls — twenty thousand health behind
  twenty-two points of armour — so four of them change the arithmetic
  rather than the numbers: armour stops applying, a round gains a quarter
  a tier, the last sliver of a pool is skipped, and a heavy hull detonates
  where it falls. A relic never switches an authored system OFF, only adds
  an answer to one. A relic is
  held once, so a run's relics are a **Set** where its mods are a tally,
  and the G button genuinely runs out. Its own odds table (`RELIC_ODDS`)
  and every tuning number the behavioural relics need
  > These two used to be one file with a `scope` field, and one tab called
  > *Upgrades* held them both plus the tech tree's rungs. **There is no
  > such thing as an "upgrade" in this game**: there are Mods and there are
  > Relics
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
  Mindustry sprites in `public/mindustry/` plus procedural regions. The
  sheet is packed at load: a cell is asked for by size with `reserve()`
  (or `sprite()`, `tile()`, `top()`, `flat()`, which are `reserve()`
  with a shape) and drawn into with `drawCell`, which clips to it. No
  pixel coordinate is ever typed, so cells cannot overlap
- `game/animalArt.ts` — the enemy families as animals, generated pixel
  art packed over the stock cells while `ANIMAL_ART`
  (`game/animalFlag.ts`) is on. The style, the sizing rule and how to
  add a family are in [docs/unit-art.md](docs/unit-art.md)
- `game/turretArt.ts` — the player's turrets as FOUNDRY, one gunmetal
  plating with a silhouette a kind and an accent per ammo, generated the
  same way and packed over the stock turret cells while `FOUNDRY_ART`
  (`game/turretFlag.ts`) is on, the stock plates darkened under them.
  The HUD's turret pictures and the placement ghost come off the same
  drawings. THE ART IS THE PNG SHEET, not the code that seeded it:
  `docs/turret-concepts/mill-<kind>.png` is drawn by hand on top of what
  `npm run gen:turrets` first rendered, `npm run sync:art` copies it into
  `public/foundry/` before every dev server and build, and
  `game/foundryArt.ts` names the files. The direction and the drawing
  rules are in [docs/turret-factions.md](docs/turret-factions.md)
- `game/renderer.ts` — WebGL2 instanced sprites: static terrain, shadow
  and wall batches, one dynamic batch in painter's order, and a shield
  pass. Water is a batch and a program of its own — Mindustry's
  `water.frag`, ported
- `game/game.ts` — rAF loop, input, 2d overlay (placement ghost, range
  rings, health bars, the inspect mark), stats and the **minimap**
  (`drawMinimap`): the whole map at a cell a dot, never zoomed, the
  player's structures white, the swarm red, the viewport framed; a press
  looks there, a drag keeps steering
- `components/Deal.tsx` — **the field's bottom-right corner on a charged
  run**, and it is **the minimap's square** mirrored: four buttons in a
  2x2 (Buy turret **T**, Buy mods **M**, Buy relics **G**, Amount **X**)
  plus **R**, which turns the ghost rather than pressing anything,
  the ONE card the first of them throws, drawn already in hand, and the
  few-second **reveal** the module buttons get because a module has
  nowhere to land. **Amount** cycles 1 / 4 / 9 and multiplies whichever
  button is pressed next, at a flat price with no bulk discount: on the
  modules that is N draws, on the TURRET it is one card whose shape is
  **tiled** N times (`formation.ts` `fleetLayout` — the amounts are
  SQUARES, so a fleet tiles square and the copies butt with no gap) and
  turnable a quarter at a time (`fleetFootprint`), so what the amount buys
  is ground rather than variety. It keeps
  no state of its own: the card IS what is in hand (`Game.buildKind` +
  `buildForm` + the card's `n`), so the corner reads it off the HUD
- `components/Relics.tsx` — **the shelf**: every module the run owns, in a
  row along the top-left of the field — **relics first, then a divider,
  then the mods**, because a rule always in force and a 30% roll on the
  next placement are two different kinds of thing and one undifferentiated
  row said neither. Each chip is on its band's ground with a glyph drawn
  rather than sprited; a mod's card carries its odds and its stack total, a
  relic's says it is simply on
- `components/Animechs.tsx` — React shell: HUD (scrap, XP), difficulty
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
- `components/RaritiesView.tsx` — the admin dashboard's **Rarities** tab:
  every roll in the game and what it is weighed against — the turret, shape,
  **mod** and **relic** band tables (`rarity.ts` `weightDial`) and the
  per-mod roll chance — each dial printing its own normalised share, because
  a band weight is relative and means nothing until it is read against its
  table. The mods and the relics get a knob each: they used to share one,
  so bending "ultra" moved both categories at once.
  Saves into the same `public/balance.json` the prices use, whole-document
  (`currentBalanceDoc`) so neither admin page can wipe the other's afternoon
- `components/Knob.tsx` — the dashboard's one slider-plus-field dial, shared
  by Balance and Rarities
- `components/Unlocks.tsx` — its **second tab**: every turret, mod, relic,
  rule and map in the game on one page with a strip of filters over it —
  **turrets, mods, relics, mutators, maps**, the order a player thinks in,
  walking outward from the thing on the board to the world round it. The
  mods and the relics are **two tabs**, not one *Upgrades* tab holding both
  plus the tech tree's rungs: a player reading that could not tell which
  half was a chance on a placement and which was a rule over the board.
  Locked unlocks are dimmed, so a save part way up sees a Mods tab mostly
  lit and a Relics tab mostly dim — the pacing of the catalog, visible. It
  replaced the mutator codex, which answered only the rules half of that
  and did it through a pannable camera left over from the old tech tree —
  the wrong instrument for a list read once and closed
- `components/LevelEditorView.tsx`, `MapEditorView.tsx`, `BalanceView.tsx` —
  the admin authoring surfaces

There is no Sandbox tab any more: **custom mode** on the deploy screen
hands over the dials (see *Two modes* below), and Ctrl+Shift+S inside any
run is the rest of what the sandbox was — whole card unlocked, nothing
charged, every pace offered.

In dev builds the running `Game` instance is exposed as `window.__animechs`
for console poking, and the ladder's tuning surface as `window.__ladder`
(`.spec(n)` for a rung's playable spec, `.budget(n)` for what the
arithmetic says it costs, `.stages()` for the stage table, `.grind()` to
print it).

## Controls

Mouse and keyboard (`game/game.ts`); the game is a desktop game and there
is no touch input.

| | |
|---|---|
| build | **T**, then left press on the ground. The draw comes out already in hand, so the flow is T, click, T, click. One card is one FORMATION, four to thirty-six turrets in a shape — times the amount (**X**). On a free board (sandbox, editors) pick a turret on the command card instead, or its key, and drag to chain; **shift-drag for a straight line** |
| re-roll | **T** again — it throws the card in hand away and draws another, at full price. Spam it until the shape is the one you want |
| buy mods | **M**, 2,000 each. The mid game's answer: a standing chance on every turret placed from then on. In force the instant they land — nothing to aim, nothing to place, no re-roll |
| buy relics | **G**, 150,000 each, and **locked until level 16**. The late game's answer: rules that change the game over the whole board the moment they are paid for — the board fires twice as fast, armour stops applying, a dead T5 takes its escort with it, every turret stands back up. Same: nothing to aim, no re-roll |
| turn the card | **R** while the ghost is up, or the strip under the card — a quarter clockwise, free, and it turns the WHOLE footprint. Ten of the twelve shapes are symmetric under a quarter turn, so only the Wedge visibly moves — and a fleet of wedges turns as one |
| amount | **X** cycles ×1 / ×4 / ×9 and multiplies the next press, at flat price. On **M** and **G** that is N draws; on **T** it is one card carrying the shape **tiled** N times, square and gapless — so ×9 of a citadel is one ghost of 324 turrets in an 18×18 block to find ground for |
| discard | right press while holding a card. No refund |
| demolish | right press, drag to chain |
| select a building | left click with no tool picked — ONE building shows its range ring; drag a box for a region, or shift-add, and the rings stay off so the fight is still visible |
| select every like it nearby | ctrl-click or double-click (`SEL_LIKE_STRUCT_R`) |
| sell the selection | delete or backspace |
| inspect an enemy | click an enemy body, a shield tower or a taken turret — the panel reads it out and an arrow marks it. A question only: no turret changes aim for it |
| pan | middle drag, WASD/arrows, two-finger trackpad scroll |
| minimap | click to look there, drag to keep steering — bottom-left, never zoomed |
| zoom | wheel, trackpad pinch |
| pause / menu | space / esc, or the gear in the top-right corner |
| fullscreen | F11 (Ctrl+Cmd+F on macOS), in the desktop shell — or the Video tab of Settings |

The zoom floor is the whole map in frame with a little padding; the
ceiling is 12. **Pan speed** — one knob for the keys, `PAN_RATE` times the
setting, defaulting to 150% — lives on the Controls tab of Settings, saved
with the rest of the preferences. There is no edge panning.

There is **no pace strip on a campaign run**: the multipliers belong to
the sandbox — Ctrl+Shift+S inside a run — and space pauses.

Settings is five tabs — **Game** (the save), **Video**, **Interface**,
**Controls**, **Info**. **The Interface tab** holds the UI-size slider and
**who wears a health bar on the field**, one knob a side: *always*,
*damaged* (the default), *hover* or *never*. It governs units and
buildings alike, the core included. The player's bars run the HUD's
green-amber-red ramp and the swarm's are red throughout. Both knobs are
saved and reach a run under way the moment they are touched.

## Two modes

**Every run is deployed in one of two modes**, picked at the top of the
deploy screen (`GameMode` in progress.ts). They are the same game; what
separates them is how much is CHOSEN, and what that costs:

| | Regular | Custom |
|---|---|---|
| map | rolled over every map the track has opened | picked — any map, locked ones included — or Random |
| difficulty | picked, up to what the track has opened | picked, the whole ladder open |
| enemy factions | rolled (`rollFamilies`) | picked, any one to three of the six; the rest rolled |
| mutators | rolled, from the deck the track has dealt | picked from the whole catalog, or rolled over all of it |
| **XP** | **banked, times the rung's bonus** | **none, and no clear recorded** |

**Regular is the campaign and the only mode that pays.** It takes ONE
pick — the difficulty — and rolls everything else on Start, because a
run's map, swarm and rules are the run's own news and a menu that showed
them in advance is a menu a player re-rolls by touching a macro.

**Custom is the sandbox.** It hands over every dial, ignores every track
lock, and banks nothing — which is precisely what makes the dials safe to
hand over: a run built to be won cannot be turned into levels. The old
admin **Sandbox** tab is a key now: inside any run, regular or custom,
**Ctrl+Shift+S** opens the whole tech tree, free placement and every game
speed. It is a debug door, not a mode — a regular run still settles the
way it was deployed.

Mutators can only be named where the difficulty rolls any at all (Nemesis
+1 and up); ticking rules at Incursion would be a difficulty the ladder
has never priced. A named set is played EXACTLY as named — as many as you
like, over budget if you like, which is the whole point of being able to
look at a rule rather than wait for the dice to offer it. The difficulty's
own budget is printed beside the total as an advisory.

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
dozen Ironhide runts on wave 1, the first elites by wave 10, waves in the
thousands by the forties, and the Boss as the boss that closes the
script. The gap is shorter than a wave takes to walk the lane, so the
waves overlap and the field is a tide rather than a series of fights —
which is the whole reason the sim is built for 10,000 to 15,000 bodies at
once (`MAX_UNITS`, 22,000). The gap is the document's
(`public/levels/campaign.json`) and the level editor edits it.

### Two currencies that never touch

**Scrap is the run's money, and every bit of it comes off the swarm.**
Every run opens with `SCRAP_START` (7,500), and after that a kill drops
scrap **off its own health pool** — `SCRAP_PER_HP`, a fifteenth, which is
the ten scrap a 150-health runt has always paid — with `BOSS_SCRAP`
(5,000) on top of a boss. **That is the whole of it.**

Staging a wave used to pay a bonus as well, 250 and 50 more each wave — so
500 by wave 5 and 2,750 by wave 50 — and it was passive income: a board
that killed nothing banked it anyway, for surviving the gap. It is gone.
**The bank moves when bodies fall and at no other time.** The core pays
nothing, nothing is mined, and selling returns nothing (`SELL_REFUND` is
0): a draw is spent. Nothing carries between runs. There is no gate inside
a run: whatever the save owns may come out of the deal from wave 1.

**Drops are fixed per kind.** A runt always pays the same, on every
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
the whole pot however the last wave ended. **The difficulty is the only
multiplier.** A random map — the menu's default — used to pay a quarter
more on top, and does not any more: Random is the default because it is
the best way to play the campaign, not because it is bribed, and a bonus
on it made every deliberate map choice feel like a tax on knowing what
you want. XP turns into **player level** through a power-law curve
(`xpToNext`), and **every level is a step on the track** (`game/track.ts`)
that hands out a map, a turret, a mod, a relic or a mutator — nothing is
chosen and nothing is bought.

### The deal

**A turret is not bought, it is drawn.** The field's bottom-right corner
is **the minimap's square, mirrored** — the two bottom corners of a
StarCraft HUD are *where you are* and *what you can do*, so they read as a
pair — with **four buttons in a 2×2**: **Buy turret** (**T**), **Buy mods**
(**M**) and **Buy relics** (**G**) — the three things that can be bought,
the last two under *The modules* below — and **Amount** (**X**) last, in
the far corner, because it is the modifier on the other three. **R** turns
the card in hand and is deliberately *not* in the square: it is a verb on
the ghost, so it lives on a thin strip under the card. Buy turret pays the roll fee, rolls both tables and
**puts the card straight into the hand**: the turret's sprite, its rarity's border,
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

### The amount

**The fourth button cycles ×1 / ×4 / ×9** (`BUY_AMOUNTS`) and multiplies
whichever of the other three is pressed next. It is a **standing setting**
and not a held modifier — a player who has decided they are buying in tens
is buying in tens until they say otherwise — and it wears the gold
pressed-in band while it is off 1, because a run that has forgotten it is
about to spend ten thousand scrap should be told so.

**The price is flat N× with no bulk discount anywhere.** The button buys
keystrokes and never value: a discount would make the single press
strictly wrong, and the single press is the whole T-click-T-click flow.
Every press is **all or nothing on the scrap** — a bank that cannot cover
the whole amount buys none of it rather than quietly handing over the
seven it stretched to.

**What the amount does is different on the two sides, and that is the
design.** On **M** and **G** it is N independent draws: nine relics is nine
relics, and one press gets ONE reveal card listing its nine rather than nine
cards queued five seconds apart. On **T** it is *not* nine cards — it is
**ONE card whose shape is tiled N times** (`fleetLayout`), so a ×9 press
still rolls one gun and one shape and what it multiplies is **the ground
being asked for**.

**The amounts are SQUARE NUMBERS, and that is the point of these three.**
4 is two copies by two and 9 is three by three, so a fleet is the shape
scaled up and still the shape: a square block stays a square block, a ring
stays a grid of rings, and the footprint has the proportions of the card
that bought it. They were 5 and 10 once, which are not squares — 5 had to
be laid out as a plus and 10 as a five-by-two slab, shapes nobody designed
that an oblong number forces. A square amount needs no authored layout at
all; `fleetLayout` fills a square grid and the answer is right by
construction.

**The copies butt together.** ×9 of a Block is one solid **9×9** of
turrets, not nine 3×3s with lanes between. A gutter of one turret-cell
used to run between them so a fleet would read as its copies; what it
actually did was turn every square amount back into an oblong footprint
with holes in it, and holes in a wall are where the swarm walks. The
card's own diagram already says how many copies are in the fleet.

So ×9 of a citadel of spectres is 324 turrets in one ghost, 9,000 scrap,
and **finding ground for it is most of the reward**. The card's corner
diagram draws the whole tiling, so what the hand is
holding is a picture of what the board is about to get.

**R turns it** — a quarter clockwise, free, as many times as you like
(`fleetFootprint`). It turns the **whole footprint** and not the shape
inside it: a fleet is the shape tiled square, so turning it turns every
copy at once. The shape stays centred on the cursor through the turn,
because the span it is centred on swaps with it. Most formations are
symmetric under a quarter turn, so only the **Wedge** visibly moves — which is why the strip under the card reads the *angle*
(0 / 90 / 180 / 270) rather than just "turn", so a press of R on a Bastion
does not look like a key that does nothing. The turn belongs to the
**aiming**, not to the card: it survives a right click that stows the
ghost, and a new card comes out square.

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
the **weights are not** (`Game.setRarityWeights`), because a relic can shift
them — that is what Ascendancy Protocol is. A rarity is rolled first and a
turret picked uniformly inside it, so adding a fourth purple would make
*which* purple less predictable and never make purples more likely. The
draw pool is exactly what the track has handed the save (`turretsAt`),
minus the retired kinds.

**The shape odds are the generous half of the same button**
(`FORMATION_WEIGHTS`: 40 / 30 / 20 / **10**) — an ultra shape about one
draw in ten against an ultra turret's one in a hundred. The turret roll is
where a run's tension lives, and odds as steep on both would invert what a
player feels at the button: *which gun* first, *how much of it* second.

### The modules — Mods and Relics

**There are exactly two categories of module, and neither is called an
"upgrade."** **MODS** (`game/mods.ts`) are the **mid game's** answer: a
chance riding every turret placed from now on, bought by the fistful off
**M**, each one a number on a gun. **RELICS** (`game/relics.ts`) are the
**late game's** answer: a rule over the whole board, bought once off **G**,
every one of them something the board could not do before.

They used to be one file behind a `scope` field, and the Unlocks board had
one tab called *Upgrades* holding both of them plus the tech tree's rungs —
three unrelated things under a word none of the three is called. Two
categories, two files, two odds tables, two buttons, two tabs.

**What either hands over is already in force.** There is no card, nothing
to aim and nothing to place: T is a bet on the ground and these are bets on
the run, which is why they are not the same button as T. There is no
re-roll either — what T buys can be thrown away and drawn again, because a
shape you cannot fit is a dead card; what these buy is never dead, so
pressing again is simply buying another module.

**M is 2,000 and G is 150,000**, and the gap is the two categories. A mod
is *odds on the board still to be bought*; a relic is *certainty*, in force
over every turret already standing and every one still to come, and it
never stops. They used to be one button flipping a coin between the two,
which meant a player who needed a relic paid relic money for even odds of a
mod: **a purchase whose category is random is a purchase the player cannot
aim.**

**Only the G button ever runs out.** A relic is held once and there are
fourteen, so the relic half empties and the button goes dark saying *all
owned*; a mod has no cap — a copy scales what a turret born with it gets —
so M is **open or locked and nothing else**. A press whose half runs out
part way through stops there and is **charged only for what it handed
over**.

**Each category has its own band table**, and the roll picks a band first
and a module inside it — the same two-step the turret and shape tables use.
Both are **52 / 30 / 16 / 2**, steeper at the top than the shape table's,
because a formation is spent the moment it is placed and a module is owned
for the rest of the run. They used to share one dial, so bending "ultra"
moved the odds of an ultra *mod* and of an ultra *relic* at once.

**The whole catalog buffs the player.** Nothing in either half weakens the
swarm — that is the mutators' half of the game, and they pull the other way.

**And the track deals them in that order** (`game/track.ts`). The mods fill
the **front** of the campaign, levels 2 to 14, cheapest band first; the
relics fill the **back**, `RELICS_FROM` = **16** to the top of the track at
30, one a level — so the campaign's last row hands over Ascendancy
Protocol. That is not housekeeping — it is the two categories being two answers to
two halves of a run. The G button prints *locked* until level 16, which is
the level after the mutator phase opens: where the game is first allowed to
be hard. It used to open on level **3**, which handed a player Overclock
Core before their second map.

### The mods (M) — a chance on every turret placed

Owning one improves nothing on the board: it adds a roll to every turret
*placed from now on*, and a turret that wins it carries the mod for as long
as it stands (`Tower.mods`, a bitmask; `Tower.spec`, its own resolved
stats). A card puts down four to thirty-six turrets, so **a patch comes out
speckled** — thirty-six duos, four of them gleaming. A turret carrying one
wears a **pip in the corner of its footprint** in the band of the best mod
it has, always, not on hover: the whole point of a chance is being able to
see which ones won it.

**Only the rare and ultra ones have names.** A common is not a character,
it is a tick: **"+2% damage" IS its name**, and a made-up one over the top
would be a word to learn in order to be told what the number already said.
The **glyph is the stat** and the **band colour is the size**, so a grey
barrel and a blue barrel are the same dial at two steps and need no caption
at all. *(Relics keep their names, all fourteen — a relic is never a
number.)*

**Every mod is rolled for every turret, independently** — there is no "at
most one". A placement rolls once per mod the run owns (`rollTurretMods`),
so a turret can come out carrying all of them and the odds alone make that
rare. That is *why* the low bands are small numbers: a run banking ten mods
is folding ten multipliers onto one gun.

**A second copy is a bigger number, not better odds.** The chance is the
def's and never moves — a player reading "30% on every turret placed" off
the shelf has to be able to keep reading it after they buy the fourth — and
what a copy buys is the **effect**: three copies of +8% damage is +24% on
every turret that wins the same one roll in three. Every mod's upside is
linear in copies (`1 + (m − 1) × n`) and what it **charges** never scales: a
second Sniper does not take another ninety per cent of the turret's health.
It is still one bit on the turret, so the strength is read off the run's
ledger when the spec is composed (`applyTurretMods`) — which is how a copy
bought mid-wave reaches the turrets already standing.

**A mod is anything that composes onto one turret's table.** It used to be
narrower — "a stat tweak and nothing else" — and the line was in the wrong
place: a fuse firing five spikes instead of three is the gun doing a
different thing, not a number going up, and it is still one turret's
business. So a mod may change what a turret *does*, through its table —
shots, spread, pierce, repair. What it may not do is reach past the turret
it landed on: "when this dies" is a *moment*, not a table, and a moment is
a relic.

| mod | band | chance | what it does |
|---|---|---|---|
| +2% damage | Common | 30% | |
| +2% fire rate | Common | 30% | |
| +4% health | Common | 30% | |
| +2% range | Common | 30% | |
| +4% damage | Uncommon | 18% | |
| +4% fire rate | Uncommon | 18% | |
| +8% health | Uncommon | 18% | |
| +4% range | Uncommon | 18% | |
| repairs 0.15% a second | Uncommon | 18% | the one stat a plain turret has none of, so the tick is the whole thing |
| **Prototype Chassis** | Rare | 10% | +12% damage, +12% fire rate |
| **Bulwark Plating** | Rare | 10% | more health, armour and repair at once |
| **Sabot Rounds** | Rare | 10% | +1 pierce and harder rounds with it |
| **Splitter Array** | Rare | *per fuse* | +1 spike a volley. **Fuse only**: rolled on every fuse placed and nothing else |
| **Giant** | **Ultra** | **per CARD** | vastly more health and damage, far less range, twice the footprint — and it eats the card |
| **Sniper** | **Ultra** | | reaches four times as far and dies to a stiff breeze |
| **All Round** | **Ultra** | | simply better at everything |

(The exact steps are authored in `game/mods.ts` and turnable from the admin
Rarities tab; the table above is the shape of the ladder, not a spec.)

**THE GIANT EATS THE CARD.** If a placement rolls it, the shape is
discarded and the whole card is spent on **one building** at the middle of
where the patch was going — twice its kind's edge, so a 4×4 foreshadow
becomes an **8×8**, the biggest thing that will ever stand on the board.
`Tower.size` is per-*tower* for exactly this: the ground it claims, the
shadow it casts, the quad it is drawn on and what a unit walks into all
read it, never the table.

**It is rolled once per CARD, not once per turret,** and it has to be.
Every other mod is per placement because a patch coming out speckled is the
charm of them; this one *replaces* the patch, and a ×9 citadel is 324 rolls
— at any chance worth having, 324 rolls is a giant every single time. **A
giant that will not fit is not a wasted card:** if the ground has no room
for the doubled footprint the shape goes down as it always would.

### The relics (G) — the late game's answer

**What a relic is FOR is a swarm of T5s.** By the back half of the track the
thing walking up the lane is twenty thousand health behind twenty-two points
of armour, and it is not alone. Nothing a mod does answers that — a stack of
"+4% damage" is a bigger number against a wall that subtracts a flat 22 off
every round, which is the wall winning by arithmetic. So the relics are the
answers that **change the arithmetic**.

**Every relic is powerful, and the price is why.** 150,000 scrap is a
hundred and fifty turret cards, or the whole opening bank twenty times
over, and nothing at that price may be a percentage. A relic at "+10%
damage" would be a mod with a worse price tag, and the run could not tell
the two buttons apart by what they did — only by what they cost.

**The band is how OFTEN, not how good.** Every relic costs the same
150,000, so the four rarities are only the odds G draws against: a *common*
relic is the one that comes up often, and it still has to be worth the six
figures when it does. Overclock Core is a common and it doubles the damage
of every gun on the field.

| relic | band | opens | what it does |
|---|---|---|---|
| Overclock Core | Common | 16 | every turret deals **double** damage |
| Coolant Loop | Common | 17 | every turret fires **twice** as fast |
| Scavenger Rig | Common | 19 | every kill pays **triple** scrap |
| Salvage Insurance | Uncommon | 20 | every wrecked turret pays 2,000 scrap — two cards' worth, every time |
| Phosphor Rounds | Uncommon | 21 | every shot burns white, hits half again as hard, and punches through 2 more bodies |
| Last Volley | Uncommon | 22 | a wrecked turret gives every turret within 8 tiles **triple** fire rate for 15s |
| **Cascade Charges** | Uncommon | 23 | a **T4 or T5 hull comes apart where it falls**, for a fifth of its own maximum health over 6 tiles — enough to set off the next one. A wall of heavies unzips itself |
| Phoenix Protocol | Rare | 24 | a wrecked turret has a 50% chance to stand straight back up — **every time**, no limit |
| Twin Fire | Rare | 25 | every turret fires one more round in every volley |
| **Monofilament Rounds** | Rare | 26 | **ARMOUR STOPS APPLYING.** Every hit the board lands is dealt in full, whatever the body is plated in |
| **Titan Rounds** | Rare | 27 | every hit gains **a quarter again per tier** above the first, so a T5 hull takes **double** |
| **Undying Legion** | **Ultra** | 28 | **every turret you own stands back up once, at full health — the ones already on the field included** |
| **Terminal Protocol** | **Ultra** | 29 | **anything knocked to 15% of its own health dies on the spot** — and 15% of a Stoop (apex) is three thousand the board never has to grind through |
| **Ascendancy Protocol** | **Ultra** | 30 | **the turret deal hands over rares 5× and ULTRAS 20× as often, for the rest of the run** |

**And the mutators pull the other way, which is the point of them.**
**Leadership** (`mutation.ts`) caps any one hit on a body near a live T5 at
10 damage, and that cap is taken *last* in `Sim.damageUnit` — so
Monofilament and Titan, which both make a hit bigger, buy almost nothing
under it. **Terminal Protocol is the relic that answers Leadership**: an
execute is not damage, so it never comes through that door at all.

**Four of them are stat surgery and the rest are moments.** Overclock,
Coolant, Phosphor and Twin Fire compose onto every kind's table
(`applyRelics`, once per kind per `refreshSpecs`, never per shot). The rest
are read **by name** at the one place each of them happens — a revive, a
refund, a body's parting blast — because there is no way to express "when
this dies" as a stat.

**A relic ADDS something; it never switches something off.** This is the
one rule about what may go in the catalog, and it is a rule about the game
rather than about the code: a relic that reaches over and disables a system
somebody authored — the support line's auras, a mutator, a unit's ability —
is a relic whose whole effect is that content stops happening. It reads as
the game doing less rather than the player doing more, and it quietly
deletes the reason the disabled thing was written. **Changing an arithmetic
is not switching a system off**, which is the line Monofilament sits just
inside: armour stopping applying changes how a number resolves, and every
body on the field still does every single thing it was authored to do — the
support hull still mends, the apex still stamps its plating, the player
just has an answer to it.

**The four anti-T5 relics live in the sim, not on a bullet,** and that is
deliberate. `Sim.damageUnit` and `Sim.killUnit` are the chokepoints *every*
damage path and *every* death in the game passes through. Written as
`BulletStats` fields instead they would have been silently inert for half
the roster: a bullet's own `pierceArmor` is honoured on exactly one of the
sim's damage paths, so an "every round ignores armour" relic bolted onto the
bullet would have done nothing at all for a lancer, an arc or a meltdown. A
relic is a rule over the whole board, so it is enforced where the whole
board passes.

**Cascade Charges is a queue, not a call.** A detonation damages units, a
damaged unit can die, and a death is what queues a detonation — done in
place it would be `killUnit` recursing into itself in the middle of its own
swap-remove. So a death only *writes* to the queue and the blasts go off
once a frame where no removal is in flight (`drainCascades`), walking the
queue by index so a charge that kills sets off the next one in the same
frame, under a hard chain cap.

**The shelf holds both categories, relics first** (`components/Relics.tsx`),
with a divider between them: a rule always in force and a 30% roll on the
next placement are two different kinds of thing, and one undifferentiated
row said neither. A relic chip carries no count because a relic is held
once; a mod chip carries an ×3 when the run has three.

### The purple band, on both sides

**An ultra MOD is the turret changing species**, and that is the whole
argument for the band: one draw in fifty, so when one lands it has to be
worth the fifty. A **Sniper** reaches four times as far and dies to a stiff
breeze; an **All Round** is simply a better turret at no cost at all; a
**Giant** is twice the building and eats a whole card to be it. A "+15%" at
the top band would be a betrayal of the border it wears.

**An ultra RELIC is the run stopping scaling like a run.** Ascendancy turns
a 1% ultra-turret draw into 20% — the run stops hoping for a 4×4 and starts
planning around them; Undying gives the whole board a second life;
Terminal Protocol makes every heavy in the game a sixth shorter, off the
END of its pool, which is the part a board grinds through at its slowest
with the hull already inside the line.

**An ultra mod may charge for its size.** The catalog buffs the player on
balance — weakening the swarm is the mutators' half of the game — but a
top-band mod is allowed to gut a stat the build does not want, which is
what makes it a build and not a bonus. That is the Sniper's tenth of a
health pool and the Giant's tenth of a range. **A relic never charges**: at
150,000 the price is the cost.

**Repair is a percentage of the turret's OWN ceiling, per second.**
`Sim.resolveTower` multiplies `modRegen(mask)` by that turret's `hpMax`
once, at the placement, and the fire loop adds `regen * dt` — so the same
3% mends a Bulwarked spectre far faster in absolute hit points than a bare
duo, and a turret that also rolled +50% health mends half again as fast as
one that did not. Nothing re-reads a percentage per tick, and it only
ticks while the turret is hurt and alive.

**A revive is a refusal, not a rebuild.** Undying and Phoenix never remove
the structure and never place a new one: it keeps its ground, its target
and its place in the list, so a line does not open for the frame it would
take to come back, and the routing never sees it happen. The hard charges
go first; the Phoenix roll is only reached when there are none left.

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
out **rules** instead, into the deck the deploy roll draws from. **Level
15 opens three at once** — the whole Light band — because a deck with one
card in it does not roll, it deals the same rule every run; after that it
is one a level, cheapest first, to the top of the track at 21. The
progress screen lists the whole track, every turret and shape chip
bordered in its rarity; the results screen names what a climb handed out.

**The difficulties that roll rules are shut until there are rules to
roll** (`difficultyOpen`): Nemesis +1 and up promise a number of mutators,
and a deck with nothing in it makes that promise a lie. The four named
difficulties carry none and are open from level 1, so the whole script at
full count is always playable. A shut row is greyed in the list and names
the level it opens at in the detail beside it, the same way a locked map
does.

**The two menders are retired** (`RETIRED_KINDS` in `game/types.ts`): the
support pair is off the field while the deal is being built, implemented
and priced and dealt to nobody. Putting them back is deleting a name from
that list.

### One script, three families a deploy

**Every map plays the same fifty waves** — `public/levels/campaign.json`,
edited in the admin level editor from any world's card. The script is
authored in three unit families (ground, ground support, air), and those
are its three **slots**. When a run deploys, **the die rolls three
families** from the six — every layer crosses every map now, and a fleet
on a map with no channel simply drives — and deals them into the slots,
tier for tier (`rollFamilies`, `transformScript` in levels.ts). In custom
mode the hand is named instead, in whole or in part, and whatever is left
unnamed is still rolled. Forty of the first ground body in the
script are forty of whichever family took the first slot. The boss
(Boss) is in no family and is never swapped.

| family | animal | one body | layer | one look | one mechanic |
|---|---|---|---|---|---|
| Ironhides | rhino | Ironhide | ground | **crimson** straight bullets | plating and worn shields |
| Weavers | spider | Weaver | ground | **acid** orbs | rot, which ignores plating |
| Starhart | stag | Starhart | ground | **star-gold** lasers | every laser pierces; heals and shields |
| Stoop | bat | Stoop | air | **magenta** charges; no gun, the body is the bomb | goes off on contact or on death; the T5 is a nuke |
| Skates | manta | Skate | water | **teal** harpoon rails | insane reach, a crawl, and the longer alive the harder it hits |
| Livewires | eel | Livewire | water | **violet** arcs that short a gun | blinks forward when hit; the top tiers cloak |

**A body is its family and how far up it stands.** There are no proper
nouns on the roster. A family comes in five ranks, the same five for
every line (`UNIT_RANKS` in levels.ts), so the whole swarm is six words
and these —

> **runt · brute · elite · champion · apex**

— and a body is `Ironhide (runt)` through `Ironhide (apex)`. It is the
same animal at five sizes, which is the rule the art is drawn to
(`docs/unit-art.md`), and it means a player who has met one family can
read every other family's ladder on sight. The boss is in no family and
is called Boss.

**The id is the family and the tier, and nothing else.** `UnitKind` runs
`ironhide1` … `ironhide5`, `weaver1` … `livewire5`, plus `boss` — so the
kind a wave is authored in (`public/levels/campaign.json`), the key in
the sim's arrays and the name on screen are all the same fact said three
ways, and no upstream unit name survives anywhere in the codebase.
`UNIT_NAMES` and `FAMILY_NAMES` in levels.ts are where the id becomes the
name, and both follow `ANIMAL_ART`: turn the switch off and the sprites
and the names are Mindustry's again together.

The one place upstream's vocabulary is still written down is the sprite
paths in `game/atlas.ts` — `/mindustry/sprites/units/dagger.png` and the
rest — because those are the actual filenames under `public/`, which the
animal art packs OVER rather than replaces.

**One hue a family, worn everywhere the family shows** (`PAL.mech` and the
rest in constants.ts, `FAMILY_ACCENT` in levels.ts): the highlight on the
hull — the `-cell` region and the engine flames, which Mindustry paints in
the team's colour and this game paints in the family's — its shots, its
motes and rings, and the symbol of every status it lays. The sprites are
Mindustry's; what they wear is ours, and none of the six hues is a
Mindustry ammo colour, so the swarm's colours are never the board's.

The deal is shown on the field in the bottom-right corner, StarCraft-style:
a column of squares growing upward, the bottom one always the three
families dealt, every square above it one mutator in force.

### What a family IS

A family is not five bodies that share a colour — it is **one idea at five
sizes**, and every row says so. Every family is authored to the same
shape: **the T1 is the idea in miniature**, one or two tiers carry a
**field** for the crowd (a shield, a bubble, a heal, a stamp), one tier
**reaches** further than the rest, and one tier hits an **area**. The
looks are Mindustry's classes and palettes where a family kept them and
this game's own where it did not; the bite is tuned with the stage table
open.

**Ironhides — straight bullets, heavy plating, worn shields.** Every
weapon in the line is a round that goes where it is pointed: no arc, no
beam, no flame. What a tier buys is **calibre** — 18, 26, 55, 70, 80 a
round — which is the same thing the line's own armour asks the player for,
read from the other side. The **brute** carries a fast short carbine where
Mindustry gives its ironhide2 a flamethrower, so the T2 of a bullet family is no
longer useless until it is standing on the turret. The **elite** fires
its siege shell **flat** rather than lobbing it, at exactly its upstream
reach (30 tiles) — so it can be blocked, which puts it back inside the rule
the rest of the line plays by. The brute and the elite wear a **personal
shield**; the **champion** projects one over the crowd; and the **apex**
hands down its **plating** — +12 armour to everything within nine tiles
(`armorField`). Armour is a flat shave floored at a tenth, so an apex in
the crowd does not make it tougher, it makes **small calibre stop
working**.

*What it poses:* a wall that walks. The answer is calibre, never volume.

**Weavers — one orb, one status, five tiers.** Every weapon on the
tree throws the same thing: a filled **purple orb** (`venomOrb`, no sprite
— the renderer fills a disc, bright core over dark rim) landing **poison**.
The line used to be four weapon classes wearing one palette — a contact
bomb, slag orbs, sap beams, shrapnel rays — and read as four families. The
**runt**'s suicide charge is gone: a status that works over six seconds
cannot have its opening tier delete itself on arrival. It spits once every
three seconds instead, and the orb **bursts** from the T2 up — a tile-wide
splash on the brute, wider on the elite, a thrown bomb at T4 and a
barrage at T5, so the family is one idea growing rather than three tiers of
pea-shooter and then two of bombardment. The **brute** is the same gun on
four barrels; the
**elite** carries the game's only **haste field** (`hasteField`, ×1.35
within ten tiles) because rot runs on a clock and the family wants more
applications inside it; the **champion** adds a thrown **poison bomb** that
rots a whole patch from 25 tiles; and the **apex** throws nothing else.
The bodies are lighter and quicker than upstream's, and the legs are cut to
about a third of Mindustry's length — the family scuttles rather than
strides.

*What it poses:* **rot ignores plating** (`Tower.poison`, and
`damageTower`'s `pierceArmor` door — burning has the same exemption on the
swarm's side). It is the family a board that out-armoured the Ironhides
still loses turrets to. What a tier buys is **rate and reach, never a
better status**: the rot is the same six seconds from the T1 and the T5
(`POISON_TIME`). What a tier buys is **how much of a patch one orb rots at
once**.

Applications add their rate and refresh the clock, and everything above one
application **bleeds back down** (`POISON_DECAY`) — so what a turret is
actually rotting at is an equilibrium between how fast the spitters are
landing shots and how fast the stack drains, **linear in how many of them
there are, with no ceiling**. Ten bodies is a trickle; three thousand is a
flood.

**The numbers per application are small and most of them are a chance**
(`poisonChance`): a runt's spit is six health a second at one roll in
four, an apex's bomb is ten every time, and the odds are rolled **per
structure** so a burst across a patch comes out speckled. `rate x chance` is
the same expected rot as a smaller rate landing every time — what the odds
buy is a tier ladder that doesn't move the number the player learned.

There was a flat ceiling here and it was the wrong bound twice over: it made
the rot **identical under ten bodies and under three thousand** — the one
mechanic on a field built for twenty thousand of them that did not care how
many there were — and, being a fixed number of hit points a second, it aged
out entirely against a pool that grows by multipliers. A late-run turret
carrying Giant and Bulwark is a quarter of a million health, which at the old
ceiling was eighty minutes of rot on a run that lasts twelve. The decay is
the only bound now, and it is a self-correcting one. The counter is killing
them, or out-mending them.

The two are built to be **opposite problems on purpose**: one is answered
by bringing a bigger gun, the other by not letting the clock refresh. The
Ironhides' siege shell was made blockable in the same pass that left the
Weavers' thrown bomb unblockable, so one family is answered by putting
something in the way and the other is not.

**Starhart — green lasers that pierce, and a crowd that keeps
mending.** Every weapon on the tree is an instant beam in the family's star-gold (`PAL.star`), and
every beam hits **every structure along its length** (`pierce`,
`Sim.structuresAlong`) — the corridor is the style's own width, so the
runt's thin lance takes the row it points down and the **apex**'s 57-tile,
nine-cell beam takes the patch. Nothing flies: the runt's bolt is a lance
now and the brute's lightning a **fan of three** thin beams. Every tier
heals or shields the crowd around it — the runt mends, the brute shields,
the **elite** stands in its 500-point force field — and the **champion**
and **apex** do both at once (a repair field and a shield field on one
pulse, the apex's the biggest on the roster), which is what the top of the
line was missing.

*What it poses:* a wall of green across a patch from behind a crowd that
does not go down. Kill the carriers before the line reaches the guns.

**Stoop — the body is the bomb.** No bomber carries a gun.
Each has one weapon and it is itself (`payload`): it picks the nearest
structure inside its seek reach, **dives** at it (`Sim.updateUnits`) and
goes off on contact — and it goes off **the same way when it is shot
down**, wherever that is (`Sim.killUnit`, `detonate`). A bomber that
arrives pays no scrap; one shot down does. The line keeps its speed at
every tier (the apex 9 tiles/s, not 4). The **elite** is the afterburner
(`hasteField`: the flight round it flies four tenths faster), the
**champion** carries a **jam** (`jamField`: guns within eleven tiles
reload at half pace under it) and a **cluster charge** that throws eight
bomblets first, and the **apex** carries the **small nuke**: where it goes
off
the charge arms, sits for two and a half seconds as a swelling orange orb,
and then takes 4,000 off everything within eleven tiles.

*What it poses:* an AA line over the guns it protects detonates bombers
over them. The answer is reach: kill them over nothing.

**Skates — snipers that grow old.** Every gun on the fleet is a
**rail** (`fx: "rail"`, in the fleet's teal) from **beyond the
board's reach**: fifty tiles on the runt, ninety on the apex, past the
foreshadow's sixty-two — and the apex's **pierces** everything on its
line. The hulls crawl ashore (`NAVAL_PACE`, `NAVAL_LAND_SPEED` at half)
and are half again as quick afloat, and every one carries **veterancy**
(`veteran`, `Sim.uvet`): every hit is multiplied by how long the hull has
been alive, to triple after eighty seconds — the rows are set light against
that, so a fresh fleet is a nuisance and an old one is a siege. The
**elite** is the **spotter** (`spotterField`: the hulls round it reach half
again as far) and the **champion** the **drill** (`drillField`: they age
two and a half times as fast).

*What it poses:* it is shooting you long before you can shoot it, and it
is getting stronger. The answer is the long guns, and killing them young —
the spotter and the drill first.

**Livewires — arcs that short the guns, off hulls that cannot be
held.** Every weapon is **chain lightning** in the wraiths' violet (`PAL.wraith`,
fx `arc`): the target first, then the nearest structure the last one
struck can reach, hop after hop — and every structure it connects with
rolls a **short** (`Tower.shortT`): its gun is out for a moment, a
refresh never a stack, so one hull flickers a gun and a crowd holds it
down. Every hull **blinks** (`blink`, `Sim.blinkUnit`): a hit that lands
throws it four to six tiles up its route, past the gun that landed it,
stopping short of rock and of any building. The top three **cloak**
(`cloak`): three to five seconds gone in every nine to twelve, untargetable
and untouchable and drawn as a ghost; the **apex**'s cloak **veils**
every body within ten tiles. The **champion**'s field shorts everything in
twenty-two tiles and heals the fleet by a share of its health.

*What it poses:* a line that cannot hold a target. The answer is bursts
and fields that catch a body wherever it lands, and killing the flagship
in the seconds it shows.

### The swarm shoots back

**Turrets stand on open ground, and the swarm attacks them.** Every unit
attack-moves, Mindustry's GroundAI: it walks the field toward the core and
every weapon it carries fires at the nearest structure within reach **and
in sight** on the way — a walker cannot shoot through a hill
(`Sim.hasSight`), so a turret behind a ridge is one the swarm has to come
round before it can answer; a flyer is looking down and sees its whole
radius. Every weapon is authored in `game/weapons.ts` — one look and one
mechanic a family (above) — on Mindustry's bullet classes and palettes
where a family kept them. The swarm is
Mindustry's crux team: every unit wears its `-cell` region in crux red.

A turret's cells are solid to the body but **passable to the path at a
cost** (`STRUCTURE_COST`): the field routes around a line when the way
round is cheaper and into it when it is not, and the bodies pressed into
it shoot it. So a turret across the lane is not a seal, it is a fight at
the turret. **There are no walls**, and the pool they used to hold is in
the guns: every turret carries **five** times its Mindustry block health
(`TOWER_HP_SCALE` — what goes down is what the roll handed over, so a
structure has to survive its mistake rather than be replaced out of it),
**and wears plating by footprint** (`TOWER_ARMOR_BY_SIZE`: a 2x2 shaves 4
off every hit, a 3x3 9, a 4x4 15, floored at a tenth of the hit — the
swarm's own armour rule, on the other side; a 1x1 wears none), so small
arms bounce off the big guns and the heavies still chew through them;
Bulwark Plating and the Giant add their own. The phase tier fires 30%
over stock; hurt, a
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
change what happens to a wave after it lands. **Nobody picks them in
regular mode.** The **difficulty decides the budget and the count**, and
that many rules are rolled to fit it when you deploy. It is the StarCraft II model, and the
mode it exists for is endgame resource farming: the same fifty waves, a
different set of rules every time. The catalog (`game/mutation.ts`):
Hungry Mechs, Speedy, Reconstruction, Conquest, Mech Virus, Overshields,
Armored Swarms, Hydrophobic, Leadership, Mitosis, Amphibious, Shield
Towers, Volatile — dearest first, which is codex order, and every one of
those prices is measured rather than felt (see the head of
`game/mutation.ts`) — the Unlocks
board on the progress screen says what each does, and **custom mode** (see
*Two modes*) is the one place they are chosen by hand.
