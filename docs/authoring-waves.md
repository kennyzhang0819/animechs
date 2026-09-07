# Authoring waves: one script, every map

**Every map plays the same fifty waves.** There is one authored script in
the game — `public/levels/campaign.json` — and what makes one map's run
different from another's is its ground, its doors, and the unit families
those doors let the deploy roll (`rollFamilies` / `transformScript` in
`game/levels.ts`). What a map ASKS of the run is its own, though
(`LevelSpec.mission`).

## The document

`public/levels/campaign.json` is the script — a `LevelDoc`,
`{ id, waveGap, script }`, of raw per-kind counts per wave. `index.json`
beside it lists the documents that exist. Edit it in the admin level editor
(**Edit level** on any map's card in `/admin`) or by hand in the JSON; the
dev save API (`/api/levels`) writes the campaign's id and refuses every
other, because the id goes straight into a path.

`levelDocOf(worldId)` accepts a world id and ignores it — an editor opened
on any world edits the one campaign. `WORLDS[].script` in `game/levels.ts`
is deliberately empty: a second copy in code is a second campaign, and the
two had already diverged before it was emptied.

Every rung plays the whole script: a rung sets how much of each wave's
count is sent, the mutator roll and the XP bonus (`RUNGS` in
`game/ladder.ts`), never the waves themselves, so every number the editor
prints about a script is true at every rung.

## The three family slots

The script is authored in three unit families — ground, ground support,
air — and those are its three **slots**. A deploy rolls `FAMILIES_PER_RUN`
(three) families from the ones the map's drop zones allow and deals them
into the slots, tier for tier. Forty daggers in the script are forty of
whichever family took the first slot. A map with no water door can never
be dealt the two naval lines. The boss is in no family and is never
swapped.

## Missions

- **hold** — clear every wave with the core standing. There are no
  lives: the core carries `CORE_HP` and the run is lost when it falls.
  Every shipped map is a hold.
- **survive** — last `minutes` on the clock. The script plays through and,
  if the clock is still running when it ends, its **last wave is sent
  again** every gap, each repeat `SURVIVE_LOOP_LEVELS` enemy levels
  heavier (`Sim.loadStep`). Wired and waiting for a map that wants it.

## The price bands

There is no tier gate inside a run: whatever the save owns it may place
from wave 1. The three stages (`STAGES` in `game/economy.ts`) — waves
1–20, 21–35, 36–50 — survive as the stretches the three price bands are
authored against, and the **Stages** panel in the editor sums what each
stage pays against its band's prices. A fresh save fields
`STARTING_ROSTER` (`game/track.ts`): the copper wall, duo, hail, scatter
and salvo. A script that needs a gun past those before the track hands it
out is a script a new save cannot hold.

## Checking a script

The editor prices the live buffer as you type: the ramp chart, the
per-wave guide, the stage table and the debut findings (`debutViolations`
— an armoured kind arriving against a duo board). For a full playthrough
without a browser, `npm run playtest -- --world <id>` runs the headless
builder bot through the script and reports where it gets to.
