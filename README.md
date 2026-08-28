# Swarmdustry

Tower-defense swarm prototype: flow-field pathfinding for up to 20,000 units,
WebGL2 instanced rendering, and 2x2 towers that block movement and reroute the
horde in real time.

## Run

```bash
npm install
npm run dev   # Next.js + Turbopack
```

## Architecture

- `game/constants.ts` — grid, core placement, tower/unit tuning
- `game/levels.ts` — unit stats and the tier-0 BASELINE script (4 waves)
- `game/ladder.ts` — the campaign's only difficulty axis: enemy level, wave
  count and drop bonus per tier, plus the budget arithmetic that sizes the
  opening fleet
- `game/tech.ts` — turret price curves (the volume turret is flat) and the
  tier gates
- `game/progress.ts` — the save: bank, tiers cleared, tech points
- `game/terrain.ts` — seeded value-noise worldgen: mountain ranges, a carved
  meandering valley with a branch lane, forests, outcrops, floor fringes, decor
- `game/flowfield.ts` — grid occupancy + one Dijkstra pass from the core into a
  per-cell direction field; units sample it bilinearly (pathfinding is O(map),
  not O(units))
- `game/sim.ts` — units in struct-of-arrays typed arrays, counting-sort spatial
  hash (separation + projectile hits), towers, projectiles, effects
- `game/atlas.ts` — procedural sprite atlas; **swap any region for custom art**
  (units are white sprites tinted per instance, and already rotate to face
  their heading)
- `game/renderer.ts` — WebGL2 instanced sprites, two draw calls per frame
  (static terrain batch + one dynamic batch in painter's order)
- `game/game.ts` — rAF loop, input, 2d overlay (placement ghost), stats
- `components/Swarmfield.tsx` — React shell: HUD, unit-count switcher, canvases

In dev builds the running `Game` instance is exposed as `window.__swarmfield`
for console poking, and the ladder's tuning surface as `window.__ladder`
(`.spec(n)` for a tier's playable spec, `.budget(n)` for what the arithmetic
says it costs).

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
swallowed — so a pinch zooms the **map** and never the page. Zoom 1 is
"cover" (the world fills the viewport) and is also the floor; the ceiling is
3, which is what makes a single cell aimable with a fingertip.

## Progression

There is one world, played over and over at an ever-higher **tier**. Every
wave the game will ever send is written out in `WORLDS[0].script` — the tier
does not generate waves, it decides **how many of them a run plays**: four at
tier 0, and three more per tier.

| | tier 0 | tier 4 | tier 8 | tier 16 |
|---|---|---|---|---|
| waves | 4 | 16 | 28 | 52 (all) |
| enemies | 242 | 1,849 | 4,854 | 15,683 |
| enemy health | ×1.0 | ×3.2 | ×10.3 | ×105.8 |
| salvage | ×1.00 | ×1.60 | ×2.20 | ×3.40 |

Past the end of the script the wave count stops and the enemy level keeps
climbing, so the ladder never hard-stops — it just stops adding new content
until more waves are authored.

Only **health** scales with level (×1.06 a level; +12 levels is exactly
double). Armour, speed, hitbox and drop stay at base forever, which is what
keeps a tier-1 dagger worth shooting at tier 20 and a fortress unkillable by
duos at tier 0.

### Authoring waves

Wave order *is* the difficulty gate — wave `i` first plays at tier
`ceil((i - 4) / 3)`, shown as a `T`n badge on each row in the level editor.
Three things do **not** come out in the wash, because the tier scales health
and nothing else:

- **Armour is a permanent multiplier.** `max(dmg - armor, 0.1 * dmg)` never
  scales, so a fortress costs a duo line ten times its printed health at
  every tier forever. A unit must not debut before the player can own a
  turret out-damaging its armour.
- **Health per body is difficulty that pays nothing back.** A kill drops one
  item whatever it killed, so 100 spirocts cost ~15× what 100 daggers cost
  and pay the same 100 items. Padding a wave with tier-1 bodies is nearly
  free — cost and income rise together — which is why swarm waves can be as
  big as they look good.
- **The currency mix must track the tree.** Prices are written at roughly
  copper : titanium : thorium = 100 : 15 : 2.5; drift far from that and one
  currency becomes the only real constraint.

Two more the arithmetic can't see: **air** (hail and scorch cannot shoot up
at all) and **crawler speed** (twice the line's pace, so they arrive before
the kill zone is done with them).

Check any edit from the console — dev builds also warn on load:

```js
__ladder.check()      // complaints; empty means the script is in line
__ladder.audit()      // per-tier waves, units, fleet needed, step, drop ratio
__ladder.wave(7, 3)   // what one authored wave costs at a given tier
```

### Economy

- **The volume turret is flat-priced** (duo, 8 copper, forever). Geometric
  prices cap the count you can afford at the logarithm of your income —
  60–90 turrets whatever you earn — so the treadmill lives on enemy level
  instead, where it costs the player without pricing them out. Growth stays
  on the specialists, where a hard cap is the point.
- **Cost bundles carry the drop ratio of the tier that unlocks them.**

Nothing about pricing, turret caps, or the free loadout is derived from the
wave script. `OPENING_DUOS` (the free fleet) is a fixed constant and the
campaign's difficulty anchor — the opening waves are authored to fit it, not
the other way round, so an edit that makes tier 0 heavier does not quietly
hand out more duos to absorb it. `Check ladder` reports the gap.

`COVERAGE` in `ladder.ts` is the one constant that must be **measured**
rather than reasoned out (0.48, from a human clear of tier 0 with 84 duos).
Re-derive it whenever the map, `waveGap`, `spawnRate`, or duo's stats change.
