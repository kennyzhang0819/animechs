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
- `game/mutation.ts` — the **mutation line**, the tech tree's left
  column: optional rules the player switches on, earned one rank per boss
  felled rather than bought
- `game/progress.ts` — the save: bank, rungs cleared per world, tech
  points, one saved layout per world, game speed, build-bar loadout,
  mutation switches
- `game/items.ts` — the five currencies (copper, titanium, thorium,
  plastanium, phase-fabric) plus the boss trophy (surge-alloy). A currency
  is a **line of the roster**, not a rung of one: `ITEM_OF_FAMILY` in
  `levels.ts` maps ground → copper, air → titanium, crawler → thorium,
  support → plastanium, both water lines → phase fabric
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
- `components/TechTree.tsx` — the tech tree as a zoomable map, with the
  mutation column down its left edge
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

**Every currency a map pays drops from its rung 1**, which follows from
there being no cuts: a full clear of Confluence banks ~134,000 copper and
~107,000 titanium whatever the rung, and one of Maelstrom banks its three.
So the rung is never a permission gate, only a rate.

**But a MAP is a permission gate, and that is the point.** A map sends only
a few unit lines, and a line is a currency, so each map pays two or three of
the five and no map pays them all:

| map | lines it sends | it pays |
| --- | --- | --- |
| Confluence | ground, air | copper, titanium |
| Maelstrom | crawler, support, naval + naval support | thorium, plastanium, phase fabric |

Every tech price is a bundle, so **no single map funds the tree** — the
whole opening arsenal is priced in Confluence's two currencies (it has to
be: Maelstrom stays shut until Confluence rung 5 falls), and everything from
swarmer up spans both maps. Rotating is required, not encouraged.
`__ladder.check()` lints both halves: a node no map can ever pay for, and a
node the open maps can afford but not unlock.

Each map's currencies are drawn on its card in the map select, derived from
the script it actually plays so a world cannot lie about what it drops.

### Mutation

The tech tree forks three ways off `home`. Turrets run down the middle,
the utilities off to the right — and the **mutation line** is the column
on the far left, which is not a purchase at all.

|  | the tree | the mutation line |
|---|---|---|
| how it is got | paid for out of the bank | one rank per **boss felled** |
| what it does | more turrets, faster pace | makes the run **harder** |
| owning it | permanent capacity | a **switch**, on or off per run |

The column hangs off `home`, the same trunk everything else forks from,
and is drawn in its own colour — gold on that board means *bought*.

Every save starts at **rank 0**, where the marker is the whole column.
Rank is not stored: it is the length of the boss-trophy ledger the save
already keeps (`Progress.bossKills`, one entry per distinct boss fight
won), so a boss pays a rank exactly once — a new world, or a rung above the
one it last fell on.

**A rank not yet reached is not on the board at all** — not greyed, not
teased. That is the tree's own rule (a node stays hidden until its parent
holds a point), and it is the right one twice over here: what the next
mutation turns out to be is part of the reward for felling the boss, and
a locked row of them would advertise how long the line is. Reaching a rank
only **offers** the switch; the player turns each one on and off in the
tree, the deploy panel names whichever are in force, and nothing is ever
forced on.

An mutation changes what happens to a wave **after** it spawns and never
what the script sends, so every number in `ladder.ts` — wave counts, enemy
totals, the drop-ratio audit — stays true whichever switches are on.

**Rank 1 — Hungry.** One spawn in ten walks in hungry (tinted pink, and
it never spreads: nothing in the game applies the status). Once a second
it reaches four tiles for a random neighbour that is not itself hungry,
not a boss, and on its own movement layer, and swallows it: the meal is
removed, the eater takes **double the meal's full health** onto both its
current and its maximum pool, and it draws 5% bigger. Ten meals is the
ceiling — twenty-one times the health it spawned with, at 1.5x size.

Nothing else crosses over. Not shields, force fields, repair or shield
auras, burning, wet, armour or speed — a dagger that eats a quasar is a
very fat dagger. The **hitbox never moves either**: `urad` is what
physics, splash and every targeting scan read, and the swelling is art
(`Renderer.beginScale`, one pivot applied to every part of a unit's
assembly as it goes into the batch).

And **the eating is a tax on salvage**. A devoured body is removed without
ever being killed, so it never touches `killsByKind` and pays no drop at
all, while the unit that ate it still drops exactly what its own kind
drops. Ten meals cost ten bodies' worth of salvage and hand back one.

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
- **A kill pays its family's currency in its tier's quantity.** The family
  picks WHAT (`ITEM_OF_FAMILY`), the tier picks HOW MUCH
  (`AMOUNT_PER_TIER` = 1, 3, 6, 80, 250 — fitted to each tier's mean cost
  to kill, printed health through the armour shave at salvo's 28-damage
  shell). That table is the anti-farm guard across tiers, the way
  `LOOT_PER_RUNG` is across rungs: without it a T1 swarm would be the best
  source of every currency in the game. `check()` asserts items-per-second
  comes out flat across the tiers.
- **The currency mix must track the tree, per map.** `TARGET_DROP_RATIO`
  has a row per world, normalised to that world's own biggest column:
  Confluence 100 : 80 on copper : titanium, Maelstrom 53 : 40 : 100 on
  thorium : plastanium : phase. Drift far from it and one currency becomes
  the only real constraint. What moves a row is which FAMILIES the world's
  transforms send, which is what makes a map's economy authorable at all.

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
  (`ULTIMATE_SURGE`, indexed by the turret's Mindustry valuation), which a
  boss pays once and no amount of farming produces.
- **A price says what you must fight.** Scatter and parallax shoot nothing
  but air and are priced in the air line's titanium; tsunami floods a field
  and is priced in the fleet's phase fabric; duo stays copper-only forever
  so a stalled save can always earn out of ground kills. When the currencies
  changed meaning, every node kept its **time to afford its first point**,
  measured in full clears — so the tree's order and pace are what they were
  playtested at, and only what you must fight for each node moved.
- **There is no offline income.** No idle accrual, no "welcome back" bundle;
  every item in the bank was paid for by a run somebody watched. The loot
  curve carries the whole pacing burden, on purpose.

Nothing about pricing, turret caps, or the free loadout is derived from the
wave script. `OPENING_DUOS` (50, plus `OPENING_ARCS`, 5) is a hand-tuned
constant and the campaign's difficulty anchor — the opening waves are
authored to fit it, not the other way round, so an edit that makes the
opening heavier does not quietly hand out more duos to absorb it. There is
deliberately no check on this number; it is tuned by feel.
