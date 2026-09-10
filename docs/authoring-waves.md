# Authoring waves: one script, three families a deploy

Every map plays the same fifty waves. What makes one map's campaign
different from another's is its ground and its doors, and the **family
roll** the deploy makes: the script is authored in three unit families
(ground, ground support, air), those are its three slots, and every run
rolls three families from the six and deals them into the slots, tier for
tier (`rollFamilies`, `transformScript` in `game/levels.ts`). Forty
daggers in the script are forty of whichever family took the first slot.
The boss (Disrupt) is in no family and is never swapped. The deal is shown
on the field in the bottom-right corner.

## The documents

`public/levels/campaign.json` is the script every map plays — a
`LevelDoc`, `{ id, waveGap, script }`, of raw per-kind counts per wave.
`waveGap` is the seconds held between waves (15 as authored — the clock
starts when the previous wave has finished ENTERING, not when it dies, so
the waves overlap and the field is a tide). Fifty waves, a few dozen bodies
on wave 1 and thousands by the end, at Mindustry's own unit numbers.
`index.json` beside it lists the documents. Edit a script in the admin
level editor (**Edit level** on the map's card in `/admin`) or by hand in
the JSON; the dev save API (`/api/levels`) writes the campaign document and
refuses everything else.

Every rung of a world plays its whole script: a rung sets the count scale,
the mutator roll and the XP bonus (`RUNGS` in `game/ladder.ts`), never
which waves come, so every number the editor prints about a script is true
at every rung up to the count.

## Missions

- **hold** — clear every wave with the core standing. There are no
  lives: the core carries `CORE_HP` and the run is lost when it falls.
  Every shipped map is a hold.
- **survive** — last `minutes` on the clock. The script plays through and,
  if the clock is still running when it ends, its **last waves are sent
  again** every gap, each repeat `SURVIVE_LOOP_LEVELS` enemy levels
  heavier (`Sim.loadStep`). Wired and waiting for a map that wants it.

## The price bands

There is no tier gate inside a run: whatever the save owns it may place
from wave 1. The economy is the swarm's — every kill drops its tier's
scrap and every wave staged pays a bonus (`game/economy.ts`) — so a script
prices its own defence: the three stages (`STAGES`) — waves 1–20, 21–35,
36–50 — are the stretches the three price bands are authored against,
and the **Stages** panel on the balance page sums what each stage pays
against its band's prices (`stageAudit` in `game/ladder.ts`;
`STAGE_BOARDS` says how many boards of the tier a healthy stage buys). A
fresh save fields three turrets (`STARTING_ROSTER` in `game/track.ts`);
a script that needs a gun past those before the track hands it out is a
script a new save cannot hold.

Rules of thumb for the counts:

- **Keep sending tier-1 units.** They are the line's body and nearly free
  in the health budget — a dagger is 150 hp against a scepter's 9,000.
  Padding a wave with them is what makes a swarm look like one, and the
  drop is per tier, so a wave of daggers pays what it looks like it pays.
- **Spend the budget on T3/T4/T5.** One reign weighs as much as sixty
  daggers, and the late script is where the phase-tier turrets earn
  their price.
- **Naval waves need water.** The ten hulls travel the water layer and
  the family roll only deals a naval family onto a map with a water door
  (`rollFamilies`), so a script authored in the three land families plays
  every map.

## Checking a script

The editor prices the live buffer as you type: the ramp chart, the
per-wave guide, the stage table and the debut findings (`debutViolations`
— an armoured kind arriving against a duo board). For a full playthrough
without a browser, `npm run playtest -- --world <id>` runs the headless
builder bot through the script and reports where it gets to.
