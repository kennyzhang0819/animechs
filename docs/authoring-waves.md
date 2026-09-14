# Authoring waves: one script, a deal that turns every wave

Every map plays the same fifty waves. What makes one map's campaign
different from another's is its ground and its doors, and the **family
roll** the deploy makes: the script is authored in three unit families
(ground, ground support, air) and those are its three **slots**, but a
slot is a ROLE — "the line", "the support behind it", "the third thing" —
and not a promise about which family plays it. Every run rolls
`FAMILIES_PER_RUN` families (**four**, of the seven) and deals them into
the slots tier for tier, **a wave at a time** (`rollFamilies`,
`transformScript` in `game/levels.ts`). Forty runts in the script are
forty of whichever family took the line on that wave. The boss (Boss) is
in no family and is never swapped. The deal is shown on the field in the
bottom-right corner.

## The deal turns a notch a wave

The run's families are a **ring**. Wave 1 starts at the first of them and
every wave after it turns the ring one notch, so the roles are re-let
each wave: wave 1's line is the first family, wave 2's is the second, and
over a handful of waves all four have had a turn at everything. The deal
is deterministic — the same script and the same roll give the same fifty
waves, which is what the balance audit and the headless playtest need —
and it spreads the families evenly by construction, which a per-wave
re-roll would not.

Two rules keep a wave readable:

- **A wave sends as many families as it was authored WIDE.** One slot is
  one family however many the run rolled; three slots is three. So a
  wave's slot count is the design — whether it reads as one swarm or as a
  mixture — and which families fill it is the run's.
- **`MAX_FAMILIES_PER_WAVE` (three) is the ceiling**, whatever the run
  rolled. Ten families arriving at once is not ten times the variety, it
  is mush. The variety belongs *across* waves. Where a wave is wider than
  the cap the extra slots fold back onto the families already dealt to it
  and their counts add, so nothing authored is dropped.

**Custom mode names the hand instead of rolling it**, and a named hand is
the whole list: one family named is a fifty-wave run of that one family,
and `FAMILIES_MAX` (ten, or the roster, whichever bites first) is the
ceiling. `FAMILIES_PER_RUN` is only what the *die* deals when nobody
names anything — it is not a floor under what a player may ask for.

`FAMILIES_PER_RUN` and the script's slot count are **separate dials** now
— they used to have to match, because one fixed cast held for the whole
run and a fourth family had nowhere to go. Raise `FAMILIES_PER_RUN` to put
more faces in a run; add a slot to widen the mixture a wave may ask for.

**The opening must be walkable.** A flying family is never dealt one of
the leading ring positions the opening claims (`openingDeal`,
`AIR_FAMILIES`) — the opening being the script's leading run of
single-family waves, two on the shipped campaign. A run starts with
nothing on the board, and a flight that ignores the route and the walls
is not an opening a player can be asked to solve with whatever the die
handed them. Past that stretch the script is already asking for more than
one answer at a time, and air is fair.

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
  in the health budget — a runt is 150 hp against a champion's 9,000.
  Padding a wave with them is what makes a swarm look like one, and the
  drop is per tier, so a wave of runts pays what it looks like it pays.
- **Spend the budget on T3/T4/T5.** One apex weighs as much as sixty
  runts, and the late script is where the phase-tier turrets earn
  their price.
- **A wave's keys are IDS, not names.** A body is called after its family
  and how far up it stands — `Ironhide (runt)` to `Ironhide (apex)`,
  five ranks shared by every family (levels.ts `UNIT_RANKS`) — but the
  document holds the KIND: `ironhide1`, `starhart1`, `stoop1`, what the sim and the
  sprite files use. A wave of forty runts of the first ground family is
  `{ "ironhide1": 40 }`, and the editor prints the name beside the picture.
- **Naval waves want water, and play without it.** The ten hulls travel
  the amphibious layer: half again their stat afloat and a third down on
  it ashore (`NAVAL_WATER_SPEED`, `NAVAL_LAND_SPEED`), so a naval family
  rolls onto every map (`rollFamilies`) and simply drives where the map
  has no channel.

## Checking a script

The editor prices the live buffer as you type: the ramp chart, the
per-wave guide, the stage table and the debut findings (`debutViolations`
— an armoured kind arriving against a tacker board). For a full playthrough
without a browser, `npm run playtest -- --world <id>` runs the headless
builder bot through the script and reports where it gets to.
