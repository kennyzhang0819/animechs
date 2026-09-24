# animechs

A tower-defense game. Next.js + React + TypeScript; WebGL2 instanced renderer; the
sim runs over struct-of-arrays typed arrays (up to ~22k bodies). Mindustry's unit
trees, StarCraft II co-op's mutators.

## The four systems, briefly

**Difficulty — the ladder** (`game/ladder.ts`). Nine rungs. The four named ones
(Incursion → Onslaught → Scourge → Nemesis) send a quarter / half / three quarters /
all of every wave's count, under no rules. Nemesis +1…+5 send the full swarm under an
ever-larger mutator roll. A rung is **size, then rules — never health**; the health
curve belongs to the tide.

**Enemy factions — the families** (`FAMILIES` in `game/levels.ts`). Six active, five
tiers each (ground/ironhide, dartback, support/starhart, air/stoop, naval/skate,
navalSupport/livewire), three shelved. Plus the `objective: true` trees — the boss,
the worm, the railgun, the two Pylons, the four Wardens, the two Fabricators and the
Brander — which **no wave may ever send**; only a mission or a mark on the map (a
Fabricator, a Brander, a garrison circle of Wardens) puts those down. Their health is the
same on every rung. A mission can also POST a body instead of sending it
(`Sim.garrisonUnit` / `plantUnit`): it holds a circle and never walks at the core.

**Mutators** (`game/mutation.ts`). The rules a run is played *under*, rolled rather
than chosen. Each costs points; a rung carries a budget and a count. Mandatory from
Nemesis +1 up. Custom mode may name a hand instead of rolling.

**The economy** (`game/economy.ts`, `docs/economy.md`). The core pays on the RUN
CLOCK and nothing else — no kill drops, no wave bonus — so difficulty and income are
independent. A press costs its TIER (the gun's footprint in tiles, 1 to 4, picked with
1/2/3/4) times `CARD_CELLS`, flat, times the AMOUNT (1/4/9/16, cycled with X); the SHAPE
it hands over is rolled, 3x3 to 6x6. The bands open on the run clock — tier 1 at once,
then 5:00, 10:00 and 15:00. **Mods and
relics** (`game/mods.ts`, `game/relics.ts`) are OUT OF PLAY: the catalogs, odds, shelf
and codex tabs are intact and `track.ts` deals neither, so nothing in a run can roll one.
Do not delete them.

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
game/skills.ts         the skill tree — ten nodes a turret, spent with the track's points
game/projs.ts          the player's shots in flight, as lanes — read its header before touching the shot loop
game/terrain.ts maps.ts board.ts tiles.ts   the ground
game/*Art.ts + atlas.ts                     art is CODE, drawn into an atlas at runtime
game/snapshot.ts simreport.ts simreads.ts simview.ts   THE SEAM (see below)
game/renderer.ts       WebGL2 instanced draw
game/game.ts           the client — input, UiState, overlays
components/Animechs.tsx   the React shell and all HUD
public/maps/*.json public/levels/*.json     authored data, no rules
scripts/check.mjs playtest.mjs maps/*.mjs   checks and generators
docs/                  the SYSTEMS live here, not in the files: mutators,
                       difficulty, economy, mission-design, authoring-maps,
                       authoring-waves, unit-art, …
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
   re-running `scripts/maps/<id>.mjs` wipes painted spawn tiles.
6. **A road is on a lattice.** Every leg of a `ROAD_SPECS` line is along an
   axis or exactly diagonal and every corner is 45 degrees, because the rail
   bed is drawn as tiles and those are the only headings a pixel grid draws
   exactly. `roadProblems` refuses anything else at load. Move a road and the
   terrain follows it — `scripts/maps/railbed.mjs`, not the map generator,
   which would wipe the painted layers.
7. **The file headers are the documentation.** `sim.ts`, `levels.ts`, `missions.ts`
   and the art files carry long headers explaining *why* a thing is the way it is.
   Read the header before editing the file, and update it when you change the reason.
   Reading them is the rule; writing more of them is not — see below.

## Comments: write as few as possible

The existing long headers and comment blocks are legacy. **Do not add more, and do
not match their density.** Default to writing NO comment.

- Comment only when a future agent would get it **wrong** without it: a non-obvious
  invariant, a constraint from somewhere else in the codebase, a deliberate choice
  that looks like a mistake. Nothing else earns a line.
- When one is genuinely needed, keep it to **one or two lines**. No headers, no
  banners, no ASCII rules, no CAPITALISED declarations, no essays on design intent.
- Never narrate what the code already says, restate a name, log what changed, or
  explain a number that is self-evident from its identifier.
- Editing a file with a big header: update it only if your change makes it **wrong**.
  Fix it in place, tersely — don't expand it, and don't append a new section.

**Explanation that covers a whole SYSTEM goes in `docs/`, not in the file.** If what
you want to write is about how mutators work, what the difficulty tiers mean, how the
families are balanced, or why a set of numbers is shaped the way it is, that is a
document — `docs/mutators.md`, `docs/difficulty.md` — and it is one place instead of
scattered across every declaration it touches. Write it there, or add to the document
that already covers it (`mission-design`, `authoring-waves`, `authoring-maps`,
`unit-art`, …). In the code, leave at most a pointer: `// see docs/mutators.md`. Do
not paste the explanation into both — the file loses first, every time.

## Two modes

**Regular** is the campaign: one pick (difficulty), everything else rolled, XP banked.
**Custom** is the sandbox: every dial open, nothing banked. `Ctrl+Shift+S` inside any
run is a debug door, not a mode.
