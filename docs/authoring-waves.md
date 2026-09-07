# Authoring waves: one script per map

Every map carries its own wave script and its own mission. There is no
shared blueprint and no family transforms any more: what makes one map's
campaign different from another's is what it asks (`LevelSpec.mission` in
`game/levels.ts`) and what it sends (its document).

## The documents

`public/levels/<worldId>.json` is a world's script — a `LevelDoc`,
`{ id, waveGap, script }`, of raw per-kind counts per wave. `index.json`
beside them lists the worlds that have a document. Edit a script in the
admin level editor (**Edit level** on the map's card in `/admin`) or by
hand in the JSON; the dev save API (`/api/levels`) writes any world the
campaign table holds and refuses everything else.

Every rung of a world plays its whole script: a rung sets the mutator roll
and the XP bonus (`RUNGS` in `game/ladder.ts`), never the waves, so every
number the editor prints about a script is true at every rung.

## Missions

- **hold** — clear every wave with the core standing. There are no
  lives: the core carries `CORE_HP` and the run is lost when it falls.
- **survive** — last `minutes` on the clock. The script plays through and,
  if the clock is still running when it ends, its **last wave is sent
  again** every gap, each repeat `SURVIVE_LOOP_LEVELS` enemy levels
  heavier (`Sim.loadStep`). Author the script to run out a little before
  the clock does, so the tide is the finale rather than a surprise.

## The price bands

There is no tier gate inside a run any more: whatever the save owns it may
place from wave 1. The three stages (`STAGES` in `game/economy.ts`) —
waves 1–20, 21–35, 36–50 — survive as the stretches the three price bands
are authored against, and the **Stages** panel in the editor sums what
each stage pays against its band's prices. A fresh save fields the seven
starting turrets (`STARTING_ROSTER` in `game/track.ts`); a script that
needs a gun past those before the track hands it out is a script a new
save cannot hold.

## Checking a script

The editor prices the live buffer as you type: the ramp chart, the
per-wave guide, the stage table and the debut findings (`debutViolations`
— an armoured kind arriving against a duo board). For a full playthrough
without a browser, `npm run playtest -- --world <id>` runs the headless
builder bot through the script and reports where it gets to.
