# animechs

A tower-defense game. Next.js + React + TypeScript; WebGL2 instanced renderer; the
sim runs over struct-of-arrays typed arrays (up to ~22k bodies). Mindustry's unit
trees, StarCraft II co-op's mutators.

## The four systems, briefly

**Difficulty — the ladder** (`game/ladder.ts`). Ten rungs. The four named ones
(Incursion → Onslaught → Scourge → Nemesis) send a quarter / half / three quarters /
all of every wave's count, under no rules. Nemesis +1…+6 send the full swarm under an
ever-larger mutator roll. A rung is **size, then rules — never health**; the health
curve belongs to the tide.

**Enemy factions — the families** (`FAMILIES` in `game/levels.ts`). Six active, five
tiers each (ground/ironhide, dartback, support/starhart, air/stoop, naval/skate,
navalSupport/livewire), three shelved. Plus the `objective: true` trees — the boss,
the worm, the railgun and the two tierless Wardens — which **no wave may ever send**;
only a mission puts those down. A mission can also POST a body instead of sending it
(`Sim.garrisonUnit` / `plantUnit`): it holds a circle and never walks at the core.

**Mutators** (`game/mutation.ts`). The rules a run is played *under*, rolled rather
than chosen. Each costs points; a rung carries a budget and a count. Mandatory from
Nemesis +1 up. Custom mode may name a hand instead of rolling.

**Mods and relics** — the two module categories, and neither is called "upgrade". A
**mod** (`game/mods.ts`) is a chance riding every turret placed from now on, bought by
the fistful: the mid game's answer. A **relic** (`game/relics.ts`) is a rule over the
whole board, bought once: the late game's answer, for when better guns stop being
enough.

## Checks — read this before running one

- **`npm run check`** — run this on all your work. Quick crash gate + typecheck.
- **`npm run check:full`** — **only if you touched units or in-game logic.** Another
  agent is currently expanding it into something very comprehensive, so a run may take
  **~10 minutes**. Run it deliberately, never by reflex. It is also **GPU-gated**: run
  it only on local dev on an Apple Silicon Pro/Max chip (the M3 Pro this repo is
  developed on, or better). On anything weaker — a base chip, a VM, CI, a cloud box —
  it takes 40 minutes or more: do not start it, say you skipped it and why, and leave
  `npm run check` as the gate.

## Where things live

```
game/sim.ts            the authority — bodies, towers, combat, missions. The big one.
game/levels.ts         the data — unit stats, FAMILIES, waves, WORLDS, Mission
game/constants.ts      tunables + TOWERS
game/missions.ts       the authored roads the road missions walk + their rails
game/railArt.ts        the rail beds those roads are painted as — two railways
game/flowfield.ts      pathing; everything routes to the core
game/economy.ts track.ts progress.ts        scrap, XP, the level track, saves
game/weapons.ts status.ts upgrades.ts       shots, statuses, stat dials
game/projs.ts          the player's shots in flight, as lanes — read its header before touching the shot loop
game/terrain.ts maps.ts board.ts tiles.ts   the ground
game/*Art.ts + atlas.ts                     art is CODE, drawn into an atlas at runtime
game/snapshot.ts simreport.ts simreads.ts simview.ts   THE SEAM (see below)
game/renderer.ts       WebGL2 instanced draw
game/game.ts           the client — input, UiState, overlays
components/Animechs.tsx   the React shell and all HUD
public/maps/*.json public/levels/*.json     authored data, no rules
scripts/check.mjs playtest.mjs maps/*.mjs   checks and generators
docs/                  mission-design, authoring-maps, authoring-waves, unit-art, …
```

## Things that will bite you

1. **The seam is five files.** A sim number reaching the screen goes `simreport.ts`
   (slot + `writeHeader`) → `simreads.ts` (getter) → `game.ts` (`UiState`) →
   `Animechs.tsx`. Arrays also go through `snapshot.ts` + `simview.ts`. Miss one and it
   silently reads zero.
2. **The tide.** Past its last wave a script loops forever, heavier each cycle, so no
   map can be finished by outlasting it — **every map owes a `Mission`**. See
   `docs/mission-design.md`.
3. **A moving structure fails every test written for a stationary one, silently.**
   `cellTower` is an "is this still standing" check in `nearestStructure`, `inReach`
   and `structureAt`, and `nearestStructure` also early-outs on `structBox`. Anything
   off-grid (the escort's Hauler) must be handled in all four or it simply never takes
   damage — with typecheck green.
4. **Art is code**, no image files. Read `docs/unit-art.md` first: materials are
   dark/light pairs, mirrored, nothing under 4px, drawn facing up.
5. **Maps and levels are data.** Put no rules in `public/maps/*.json`, and note that
   re-running `scripts/maps/<id>.mjs` wipes painted spawns and seeded beacons.
6. **A road is on a lattice.** Every leg of a `ROAD_SPECS` line is along an
   axis or exactly diagonal and every corner is 45 degrees, because the rail
   bed is drawn as tiles and those are the only headings a pixel grid draws
   exactly. `roadProblems` refuses anything else at load. Move a road and the
   terrain follows it — `scripts/maps/railbed.mjs`, not the map generator,
   which would wipe the painted layers.
7. **The file headers are the documentation.** `sim.ts`, `levels.ts`, `missions.ts`
   and the art files carry long headers explaining *why* a thing is the way it is.
   Read the header before editing the file, and update it when you change the reason.

## Two modes

**Regular** is the campaign: one pick (difficulty), everything else rolled, XP banked.
**Custom** is the sandbox: every dial open, nothing banked. `Ctrl+Shift+S` inside any
run is a debug door, not a mode.
