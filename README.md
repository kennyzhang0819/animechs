# MechSwarm

Tower-defense swarm prototype: flow-field pathfinding for up to 22,000 units,
WebGL2 instanced rendering, and towers (1×1 up to 4×4) that block movement and
reroute the horde in real time.

## Run

```bash
npm install
npm run dev   # Next.js + Turbopack
```

### Build number

`game/version.ts` holds `BUILD`, shown small and grey at the bottom-right
of every screen. **Increment it by one in every commit that changes what
the game does** — sim, targeting, balance, rendering, UI. A playtest
report only means something against the number that was on screen: a
stale tab or a cached bundle looks exactly like a fix not working.

## Architecture

- `game/constants.ts` — grid, core placement, tower/unit tuning
- `game/levels.ts` — unit stats and wave-script plumbing; the authored
  script itself (50 waves) lives in `public/levels/1.json`, loaded by
  `loadLevelDocs()`. Six upgrade trees: ground, support, crawler, air and
  the two **naval** lines (risso→omura, retusa→navanax), which travel on
  the water layer and cannot leave it
- `game/ladder.ts` — the **ten-rung ladder** (`RUNGS`: enemy level, shield
  scale and swarm armour each, plus the compounding drop bonus), and the
  audit/check arithmetic over the authored script
- `game/tech.ts` — the tech tree: turret price bundles (one shared growth
  constant for every turret), abilities, and the build-bar slot upgrades
- `game/upgrades.ts` — the **turret upgrade branches**: a chain of rungs
  under every turret, folded into its live `TowerStats`. Two cheap stacking
  dials, a one-shot ammunition swap, and then an **ultimate** paid for in
  surge alloy that changes what the turret is. The ultimate costs 1 surge
  on an early turret, 3 on a plastanium one and 6 on a phase one, and it is
  the only node in the tree that can be sold back. **Only duo and arc have
  one written so far** — the other fifteen are authored by hand as they are
  designed; adding one is a fourth entry in a branch with
  `tier: ULTIMATE_TIER` and its id in `UPGRADE_KINDS`, and nothing else
- `game/mutation.ts` — the **mutators**: the catalog of rules a run can be
  played under, what each is worth in points, and the roller that draws
  three or four of them to fit a difficulty's budget
- `game/progress.ts` — the save: bank, rungs cleared per world, tech
  points, one saved layout per world, game speed, build-bar loadout
- `game/items.ts` — the five currencies (copper, titanium, thorium,
  plastanium, phase-fabric)
- `game/maps.ts` — map documents: terrain layers, spawn circles, per-layer
  exit masks — see [docs/authoring-maps.md](docs/authoring-maps.md) for how
  to draw one and how to check it
- `game/editor.ts` — the level/map editor model behind the admin views
- `game/terrain.ts` — terrain from a map document when one exists, else
  seeded value-noise worldgen: mountain ranges, a carved meandering valley
  with a branch lane, forests, outcrops, floor fringes, decor
- `game/flowfield.ts` — grid occupancy + one Dijkstra pass seeded from every
  goal cell (the core is the fallback), refined by an eikonal sweep into a
  per-cell direction field; units sample it bilinearly (pathfinding is
  O(map), not O(units)). Cells pay for **where** they are as well as how
  far: single-file slots cost extra (`NARROW_COST`) and so does hugging the
  rock (`EDGE_COST` over `EDGE_REACH`), so the cheapest route is not the
  shortest one — it runs down the middle of a lane and will take a longer,
  roomier way round rather than scrape a corner
- `game/sim.ts` — units in struct-of-arrays typed arrays, counting-sort spatial
  hash (separation + projectile hits), towers, projectiles, effects
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
- `components/MechSwarm.tsx` — React shell: HUD, rung picker,
  six-slot build bar with its loadout picker, game-speed switcher, canvases
- `components/TechTree.tsx` — the tech tree as a zoomable map, plus the
  **mutator codex** as a panel over it
- `components/LevelEditorView.tsx`, `MapEditorView.tsx`, `BalanceView.tsx` —
  the admin authoring surfaces

In dev builds the running `Game` instance is exposed as `window.__mechswarm`
for console poking, and the ladder's tuning surface as `window.__ladder`
(`.spec(n)` for a rung's playable spec, `.budget(n)` for what the
arithmetic says it costs).

## Controls

One set of pointer listeners covers mouse, pen and touch (`game/game.ts`).

| | mouse | touch |
|---|---|---|
| build | left press, drag to chain | press, drag to chain |
| demolish | right press, drag to chain | the **Sell** tool in the bar, then drag |
| inspect a turret's range | left click, with no tool picked | tap, with no tool picked |
| pan | middle drag, WASD/arrows, two-finger scroll | one-finger drag, or two |
| zoom | wheel, trackpad pinch | pinch |
| pause / menu | space / esc | the two buttons in the top-right corner |

The field claims every gesture over it — `touch-action: none` on the canvas,
`user-scalable=no` in the viewport meta, and Safari's `gesture*` events
swallowed — so a pinch zooms the **map** and never the page. The zoom floor
is the whole map in frame with a little padding (`ZOOM_FIT_PAD`); the
ceiling is 12, which is what makes a single cell aimable with a fingertip.

## Progression

**There is one run in the game and ten difficulties to play it at.** Every
rung sends the whole authored script — all fifty waves, wave 1 to wave 50,
the same fifty every time. A rung is one number: the enemy level the script
is played at. It is shown to the player as *Level 1* through *Level 10* and
nothing else; there are no named difficulties.

| rung | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| waves | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 |
| enemy level | 0 | 4 | 8 | 12 | 16 | 20 | 24 | 28 | 32 | 36 |
| enemy health | ×1.00 | ×1.26 | ×1.59 | ×2.01 | ×2.54 | ×3.21 | ×4.05 | ×5.11 | ×6.45 | ×8.15 |
| enemy shields | ×1.00 | ×1.20 | ×1.43 | ×1.71 | ×2.04 | ×2.45 | ×2.92 | ×3.50 | ×4.18 | ×5.00 |
| swarm armour | +0 | +0 | +0 | +0 | +0 | +2 | +4 | +6 | +8 | +10 |
| salvage | ×1.00 | ×1.30 | ×1.69 | ×2.20 | ×2.86 | ×3.71 | ×4.83 | ×6.27 | ×8.16 | ×10.60 |

Every column is arithmetic on the rung's index — `level` is
`index × LEVELS_PER_RUNG`, shields are `SHIELD_PER_RUNG ^ index`, armour is
+2 a rung from rung 6 — so **an eleventh rung is one constant**
(`RUNG_COUNT`). Nothing about the ladder is finite in shape;
`clearedByMap` is an unbounded int per world.

Difficulties used to be **prefix cuts** as well as levels — Incursion sent
waves 1–20, Onslaught 1–35, Nemesis and Eradication all 50 — so two thirds
of the ladder never saw the best-written waves in the game. The cuts are
gone. The waves are the content, the rung is the difficulty, and the two
are completely separate.

**Salvage compounds** (`LOOT_PER_RUNG`, 1.30 a rung) and the top rung pays
its full share. That gradient is the whole anti-farm guard: a rung used to
carry a fixed roster ceiling — an Incursion was a first-three-currencies
fight forever, however much tech the save owned — and that is now deleted.
Every turret a save owns is placeable at every rung; nobody farms rung 4
when rung 10 pays 10.6×.

Since every rung runs the same waves for the same minutes, the whole ladder
is two constants against each other: the fight gets ×1.2625 harder a rung
(`RUNG_HP_STEP` = 1.06⁴) and the payout gets ×1.30 bigger, a 3% surplus a
rung that the tech tree's geometric price curve turns into time.

Per **level**, only health scales (×1.06 a level; +12 levels is exactly
double). Armour, speed, hitbox and drop stay at base, which is what keeps a
level-20 dagger worth shooting and a fortress unkillable by duos on rung 1.
The swarm armour column is flat armour on tier 1–3 bodies only, held at zero
for the first five rungs because a scatter pellet is 3 damage and even +1
would halve the game's first anti-air.

**Every currency drops from rung 1**, which follows from there being no
cuts: a full clear banks ~32,000 copper down to ~200 phase fabric whatever
the rung. So the phase-priced turrets (spectre, meltdown, foreshadow) are
reachable from the bottom of the ladder — slowly. The gate is the rate, not
the permission.

### Mutators

Some maps are always played under **mutators** — rules that change what
happens to a wave after it lands. **Nobody picks them.** The map decides
that it mutates, the **difficulty decides the budget**, and three or four
rules are rolled to fit it when you deploy. It is the StarCraft II model,
and the mode it exists for is endgame resource farming: the same fifty
waves, a different set of rules every time.

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

**Where it is mandatory:** any world whose `LevelSpec` sets `mutators`,
which is meant to be **every world past the first**. World 1 is where the
fleet is still being stood up and a roll on top of that is a wall rather
than a challenge; by the second front the player is strong enough that the
script is a formality, and the roll is what puts the fight back in it.
*(It is not switched on anywhere yet — with two rules in the catalog, a
roll of "three or four" is just "both".)*

**The costs are the only balance dial.** A mutator is worth points
(`MutationDef.cost`, 1–6 — light, heavy, brutal), a difficulty affords
them or does not, and which rules a difficulty sees falls out of the
arithmetic rather than a per-difficulty list:

| rung | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| points | 6 | 8 | 10 | 11 | 13 | 15 | 17 | 19 | 20 | 22 |

The roller shuffles the catalog, walks it taking whatever the remaining
budget covers, and keeps the fullest of two dozen such walks — **most
rules first, then most points spent**, because spending the budget *is*
the difficulty curve. The whole catalog is public: the tech tree page
carries a **codex** panel listing every rule and its cost, so the surprise
is which ones turn up and never what exists. The deploy panel spells out
the roll in full before the button is pressed, and the run plays under
exactly what it showed.

**A mutator changes a wave after it spawns and never what the script
sends**, so every number in `ladder.ts` — wave counts, enemy totals, the
drop-ratio audit — stays true whatever was rolled. A rule that wants to
change the script is a wave transform, not a mutator.

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
a wave's position only says how deep into the run it lands. Three things do
**not** come out in the wash, because the level scales health and nothing
else:

- **Armour is a permanent multiplier.** `max(dmg - armor, 0.1 * dmg)` never
  scales with level, so a fortress costs a duo line ten times its printed
  health at every rung forever. A unit must not debut before the
  player can own a turret out-damaging its armour. (Two exceptions to keep
  in mind: burning pierces armour entirely, and the lancer counts armour
  quadruple.)
- **Health per body is difficulty that pays nothing back.** A kill drops one
  item whatever it killed, so 100 spirocts cost ~15× what 100 daggers cost
  and pay the same 100 items. Padding a wave with tier-1 bodies is nearly
  free — cost and income rise together — which is why swarm waves can be as
  big as they look good.
- **The currency mix must track the tree.** The script has one target
  payout mix in `TARGET_DROP_RATIO` (normalised to copper = 100, and
  100 : 30 : 24 : 4.2 : 0.85 today); drift far from it
  and one currency becomes the only real constraint.

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
__ladder.audit()      // per-rung waves, units, fleet needed, step, drop ratio
__ladder.grind()      // the three compounding curves as one table (see below)
__ladder.wave(7, 2)   // what one authored wave costs at a given rung
```

### Economy

- **Growth is one constant for every turret** (`SHARED_GROWTH`, 1.01), duo
  included — prices are effectively flat, so turret counts are capped by the
  base bundle (hundreds of duos down to a few dozen foreshadows) and the
  treadmill lives on enemy level instead, where it costs the player without
  pricing them out.
- **Drop bonus compounds per rung** (`LOOT_PER_RUNG`, 1.30), and exists so
  a higher rung is always the better farm. It is set just above the ladder's
  own health step (`RUNG_HP_STEP` = ×1.2625 a rung) — the tech tree's
  geometric price curve turns that 3% surplus into time. `__ladder.grind()`
  prints all three curves side by side; the last column is `grindStep`,
  how many more minutes a rung costs than the one below (hold it near 1,
  and `check()` complains outside 0.75–1.30).
- **An upgrade rung is its turret's own bundle, scaled** (×20 / ×90 / ×900
  for the three payable rungs, climbing at 1.25 / 1.35 / flat). Scaling
  preserves the bundle's SHAPE, so every rung carries its turret's drop
  ratio and becomes affordable where the turret does — no gate is
  written anywhere. The fourth rung is priced in surge alloy alone
  (`ULTIMATE_SURGE`), which a boss pays once and no amount of farming
  produces.

Nothing about pricing, turret caps, or the free loadout is derived from the
wave script. `OPENING_DUOS` (50, plus `OPENING_ARCS`, 5) is a hand-tuned
constant and the campaign's difficulty anchor — the opening waves are
authored to fit it, not the other way round, so an edit that makes the
opening heavier does not quietly hand out more duos to absorb it. There is
deliberately no check on this number; it is tuned by feel.
