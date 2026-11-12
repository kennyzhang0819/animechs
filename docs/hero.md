# The hero prototype (branch `hero-corridor`)

One stationary gunner mech at the core, aimed skills, a one-direction
corridor, and a swarm that overlaps instead of shoving. Everything keys off
`HERO_MODE` in `game/hero.ts`; flip it to `false` and the game is the
turret game again.

## What it changes

- **The board.** A regular run draws `corridorMap` instead of a rolled
  board: 320 by 112 cells, the base at the west end, a spawn band across
  the east end, a river along the top for the naval families. The camera
  opens at cover from the west end.
- **The crowd.** No crowd shove: `Sim.updatePhysics` returns at once, the
  spawn spot test always passes, and the physics thread is never kicked.
  Bodies overlap freely. Rock, props and the core still stop them.
- **The hero.** The core is the mech. Hold the left button to land shells
  under the cursor; `Q` is a barrage over a wide circle, `W` a lance from
  the core through the cursor the length of the board, through plating,
  flinging what it does not kill. Cooldowns ride the header
  (`HDR.HERO_Q`, `HDR.HERO_W`) and are drawn by `Game.drawHero`.
- **The core.** `HERO_CORE_HP_MUL` times the usual health, because
  nothing else defends it yet. The line-as-health idea is not in.

Tunables are the constants at the top of `game/hero.ts`. Turrets, presses,
mods, mutators and the ladder are untouched and still on screen; `W` no
longer pans (the arrows do).

## Not in this slice

Structures that shape the crowd (walls, gates, bait, tar, mirrors,
pylons), the E and R skills, kill-charged cooldowns, the line as health,
and a mech sprite: the torso on the core is a placeholder drawn on the
overlay.
