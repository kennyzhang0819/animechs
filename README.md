# Animechs

A tower-defense swarm game. An endless wave script of up to 22,000 bodies
(`MAX_UNITS`), flow-field pathing for the whole horde, a WebGL2 instanced
renderer, and seventeen fielded turret kinds (1×1 up to 4×4) that block movement
and reroute the swarm in real time — while the swarm shoots back.

Next.js + React + TypeScript. The sim runs over struct-of-arrays typed arrays.
It ships to Steam as an Electron app: **desktop only**, mouse and keyboard, no
touch and no phone layout.

## Run

```bash
npm install
npm run dev       # the Electron shell around a production build — the dev loop
npm run dev:web   # the same build in a browser tab
npm run dev:hot   # Next dev server with hot reload; slow, and not what ships
```

`npm run desktop` builds and launches the static export;
`npm run desktop:pack:steam` leaves the Windows and Linux depots under
`desktop/release/`. The shell is its own npm package in `desktop/` — see
[docs/desktop.md](docs/desktop.md).

## Checks

```bash
npm run check        # the crash gate — seconds. Run it after every edit
npm run check:full   # ...plus the clocks, at a late run's scale
npm run bench        # the render half alone, as a table (scripts/bench.mjs)
```

`check` asks only questions with a right answer — `types` (`tsc --noEmit`),
`art`, `atlas`, `cells`, `docs`, `worlds`, `sim` — and never times anything.
Balance and play are checked by hand; `npm run playtest` is a headless run for
those questions, not a gate.

`check:full` adds the timed clocks (`frames`, `siege`, `scale`, `maps`,
`turrets`, `enemies`, `swarmfirst`, `upgrades`, `render`), held to the endgame
standard: 10k turrets and 10k bodies, both sides shooting. **Run it only after
touching units or in-game logic, and only on an Apple Silicon Pro/Max machine** —
it takes ~10 minutes there and 40+ anywhere weaker. Narrow it with
`--only siege` or `--only turrets --kinds torch,lobber --n 2000`.

## The four systems

- **Difficulty — the ladder** (`game/ladder.ts`). Nine rungs. The four named ones
  (Incursion → Onslaught → Scourge → Nemesis) send a quarter / half / three
  quarters / all of every wave under no rules; Nemesis +1…+5 send the full swarm
  under a growing mutator roll. A rung is **size, then rules — never health**.
- **Enemy families** (`FAMILIES` in `game/levels.ts`). Six active, five tiers
  each — ironhide, dartback, starhart, stoop, skate, livewire — plus three
  shelved. The `objective: true` trees (the boss, the worm) are mission-only: no
  wave may ever send one.
- **Mutators** (`game/mutation.ts`). Thirteen rules a run is played *under*,
  rolled rather than chosen, each priced against a rung's budget. Mandatory from
  Nemesis +1 up; Custom mode may name a hand instead.
- **The economy** (`game/economy.ts`). The core trickles scrap on the RUN CLOCK
  and nothing else — no kill pays — and a turret card costs its TIER (the gun's
  footprint in tiles, 2/3/4/6) times its shape's cell count. See
  [docs/economy.md](docs/economy.md). Mods and relics (`game/mods.ts`,
  `game/relics.ts`) are out of play: the catalogs are intact, nothing deals them.

Fire, poison and water are the three status channels, and all three damage
through plating — see [docs/elements.md](docs/elements.md).

## Controls

**1 2 3 4** draw a turret card of that tier (**T** re-rolls the one in hand),
**R** turns it, **X** cycles the shape 3×3 / 5×5 / 7×7. Drawing is free — the
scrap leaves the purse when the card is placed, so switching tiers costs nothing.
Left click selects, right click demolishes, delete sells. Pan with middle-drag or
WASD, zoom with the wheel, pause with space. Full table in `game/game.ts`.

## Two modes

**Regular** is the campaign: one pick (difficulty), everything else rolled, XP
banked. **Custom** is the sandbox: every dial open, nothing banked.
`Ctrl+Shift+S` inside a run is a debug door, not a mode.

## Layout

```
game/sim.ts            the authority — bodies, towers, combat, missions
game/levels.ts         the data — unit stats, FAMILIES, waves, WORLDS, Mission
game/constants.ts      tunables + TOWERS
game/missions.ts railArt.ts     the authored roads and the rail beds they're drawn as
game/flowfield.ts      pathing; everything routes to the core
game/economy.ts track.ts progress.ts    scrap, XP, the level track, saves
game/weapons.ts status.ts upgrades.ts projs.ts   shots, statuses, stat dials
game/terrain.ts maps.ts board.ts tiles.ts        the ground
game/*Art.ts + atlas.ts   art is CODE, drawn into an atlas at runtime
game/snapshot.ts simreport.ts simreads.ts simview.ts   the sim→UI seam
game/renderer.ts       WebGL2 instanced draw
game/game.ts           the client — input, UiState, overlays
components/Animechs.tsx   the React shell and all HUD
public/maps/*.json public/levels/*.json   authored data, no rules
scripts/                 checks, benches, generators
```

Seventeen maps ship; three worlds are on the menu (`PLAYABLE_WORLD_IDS`) — the
Railgun Siege, the Borer Intercept and the Hauler Escort. The rest are holds on
undressed ground, waiting for a mission.

## Things that will bite you

1. **The seam is five files.** A sim number reaching the screen goes
   `simreport.ts` → `simreads.ts` → `game.ts` (`UiState`) → `Animechs.tsx`;
   arrays also go through `snapshot.ts` + `simview.ts`. Miss one and it silently
   reads zero.
2. **The tide never ends** — past its last wave the script loops, heavier each
   cycle. No map can be won by outlasting it, so **every map owes a `Mission`**.
3. **A moving structure fails every test written for a stationary one, silently.**
   Anything off-grid must be handled in `cellTower`, `nearestStructure`,
   `inReach` and `structureAt` — including `nearestStructure`'s `structBox`
   early-out.
4. **Art is code**, no image files. Read [docs/unit-art.md](docs/unit-art.md).
5. **Maps and levels are data** — no rules in `public/maps/*.json`, and
   re-running `scripts/maps/<id>.mjs` wipes painted spawn tiles.
6. **A road is on a lattice** — every leg axis-aligned or exactly diagonal, every
   corner 45°. Move one with `scripts/maps/railbed.mjs`, not the map generator.
7. **The file headers are the documentation.** `sim.ts`, `levels.ts`,
   `missions.ts` and the art files explain *why*. Read the header before editing,
   and update it when the reason changes.

## Docs

[difficulty](docs/difficulty.md) · [economy](docs/economy.md) ·
[elements](docs/elements.md) · [mutators](docs/mutators.md) ·
[mission-design](docs/mission-design.md) · [mission-marks](docs/mission-marks.md) ·
[authoring-maps](docs/authoring-maps.md) · [authoring-waves](docs/authoring-waves.md) ·
[map-rules](docs/map-rules.md) · [placement-patterns](docs/placement-patterns.md) ·
[unit-art](docs/unit-art.md) · [turret-factions](docs/turret-factions.md) ·
[desktop](docs/desktop.md)
