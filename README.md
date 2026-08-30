# Swarmdustry

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
- `game/ladder.ts` — the three named difficulties (Incursion / Onslaught /
  Nemesis: wave cut, enemy level, shield scale, drop bonus each), plus the
  audit/check arithmetic over the authored script
- `game/tech.ts` — the tech tree: turret price bundles (one shared growth
  constant for every turret), abilities, and the build-bar slot upgrades
- `game/progress.ts` — the save: bank, difficulties cleared, tech points,
  saved layouts, game speed, build-bar loadout
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
- `components/Swarmfield.tsx` — React shell: HUD, difficulty picker,
  six-slot build bar with its loadout picker, game-speed switcher, canvases
- `components/TechTree.tsx` — the tech tree as a zoomable map
- `components/LevelEditorView.tsx`, `MapEditorView.tsx`, `BalanceView.tsx` —
  the admin authoring surfaces

In dev builds the running `Game` instance is exposed as `window.__swarmfield`
for console poking, and the ladder's tuning surface as `window.__ladder`
(`.spec(n)` for a difficulty's playable spec, `.budget(n)` for what the
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

There is one world and one authored script, played at three **named
difficulties**. The difficulty does not generate waves — every wave the game
will ever send is written in the script — it decides **how much of the
script a run plays**, and at what enemy level.

| | Incursion | Onslaught | Nemesis |
|---|---|---|---|
| waves | 20 | 35 | 50 (all) |
| enemy level | 0 | 10 | 20 |
| enemies | 14,825 | 33,688 | 49,839 |
| enemy health | ×1.0 | ×1.79 | ×3.21 |
| enemy shields | ×1 | ×5 | ×20 |
| salvage | ×1.0 | ×1.3 | ×1.6 |

The ladder is finite and that is the point: clearing Nemesis finishes the
campaign. (A hidden Eradication difficulty above it is named but not built.)
The table shows the authored values in `ladder.ts`; the shipped
`public/balance.json` currently eases Nemesis to enemy level 16 (health
×2.54) and shields ×5 while that tuning awaits migration.

Per **level**, only health scales (×1.06 a level; +12 levels is exactly
double). Armour, speed, hitbox and drop stay at base, which is what keeps a
level-20 dagger worth shooting and a fortress unkillable by duos at
Incursion. Per **difficulty** there are two more knobs in `DIFFICULTIES`:
shield pools scale ×1/×5/×20, and flat ground/air armour bonuses exist
(currently authored 0).

### Authoring waves

Wave order *is* the difficulty gate — wave `i` first plays at the first
difficulty whose wave cut reaches it (20/35/50), shown as a badge on each
row in the level editor. Three things do **not** come out in the wash,
because the level scales health and nothing else:

- **Armour is a permanent multiplier.** `max(dmg - armor, 0.1 * dmg)` never
  scales with level, so a fortress costs a duo line ten times its printed
  health at every difficulty forever. A unit must not debut before the
  player can own a turret out-damaging its armour. (Two exceptions to keep
  in mind: burning pierces armour entirely, and the lancer counts armour
  quadruple.)
- **Health per body is difficulty that pays nothing back.** A kill drops one
  item whatever it killed, so 100 spirocts cost ~15× what 100 daggers cost
  and pay the same 100 items. Padding a wave with tier-1 bodies is nearly
  free — cost and income rise together — which is why swarm waves can be as
  big as they look good.
- **The currency mix must track the tree.** Each difficulty has a target
  payout mix in `TARGET_DROP_RATIO` (normalised to copper = 100; Incursion
  100 : 15 : 3.6, up to all five currencies at Nemesis); drift far from it
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
__ladder.audit()      // per-difficulty waves, units, fleet needed, step, drop ratio
__ladder.wave(7, 2)   // what one authored wave costs at a given difficulty
```

### Economy

- **Growth is one constant for every turret** (`SHARED_GROWTH`, 1.01), duo
  included — prices are effectively flat, so turret counts are capped by the
  base bundle (hundreds of duos down to a few dozen foreshadows) and the
  treadmill lives on enemy level instead, where it costs the player without
  pricing them out.
- **Drop bonus is linear per difficulty** (`DROP_BONUS_PER_TIER`, 0.3), and
  exists only so a higher difficulty is the better farm.

Nothing about pricing, turret caps, or the free loadout is derived from the
wave script. `OPENING_DUOS` (50, plus `OPENING_ARCS`, 5) is a hand-tuned
constant and the campaign's difficulty anchor — the opening waves are
authored to fit it, not the other way round, so an edit that makes the
opening heavier does not quietly hand out more duos to absorb it. There is
deliberately no check on this number; it is tuned by feel.
