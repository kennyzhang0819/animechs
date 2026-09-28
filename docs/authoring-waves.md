# Authoring waves: one script, a deal that turns every wave

**The waves are not the objective.** Every map's objective is its
**mission** (`docs/mission-design.md`) — hold a line for so many waves,
last a clock out, cut down so many crossers — and the script is the
PRESSURE UNDERNEATH it: an engine that puts bodies on the field on a
clock and never runs out. Author it as a difficulty curve, not as a
finish line.

Every map plays the same fifty waves, and then the last eleven of them again. What
makes one map's campaign different from another's is its ground and its
doors, and the **family roll** the deploy makes: the script is authored in three unit families
(ground, ground support, air) and those are its three **slots**, but a
slot is a ROLE — "the line", "the support behind it", "the third thing" —
and not a promise about which family plays it. Every run rolls
`FAMILIES_PER_RUN` families (**four**, of the ones the save has opened — see
below) and deals them into
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
is deterministic — the same script and the same roll give the same ten
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

## The hat is what the track has opened

A faction is a **campaign unlock** like a gun or a rule (`game/track.ts`
`STARTING_FAMILIES`, `FAMILY_ORDER`): a fresh save meets five — the line, the
rot, the self-mending crowd, the one thing in the sky, which the starting
four turrets can all shoot at, and the Skates — and every `FAMILY_STEP` levels
(5, 10, 15, …) puts one more in the hat, in the order they ask for something
the board has to go and buy. **Every rolled run is dealt at least one water
family**: if the die's four hold none, one from the pool takes a random slot
(`rollFamilies`). A named hand in custom mode is played as given. `familiesAt` is the pool the deploy hands `rollFamilies`, so
**regular mode can only be sent what the save has earned**; custom mode draws
from the whole roster, as it does with maps, rungs and rules.

That is why level 1 opens at least `FAMILIES_PER_RUN` of them, and an import
check enforces it: a fresh save whose hat holds fewer factions than a run is
dealt would be a run padded with nothing. Each family carries a one-line
`gimmick` (`FAMILIES` in `game/levels.ts`) — what makes it its own problem,
said to the player — and that is the sentence the faction picker and the
track's unlock card print.

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
starts when the previous wave has finished ENTERING, not when it dies).
**Fifty waves**, forty bodies on wave 1 and thousands by the end, at
Mindustry's own unit numbers. `index.json` beside it lists the documents.
Fifty is the run's length too, for now: every swarm map is a hold of the
whole script, which stops the tide at the fiftieth wave (below), and that
wave brings the Sovereign. Edit a script in the admin
level editor (**Edit level** on the map's card in `/admin`) or by hand in
the JSON; the dev save API (`/api/levels`) writes the campaign document and
refuses everything else.

Every rung of a world plays its whole script: a rung sets the count scale,
the mutator roll and the XP bonus (`RUNGS` in `game/ladder.ts`), never
which waves come, so every number the editor prints about a script is true
at every rung up to the count.

## The clock is the script

**Wave n lands at `WAVE_GAP_OPENING + (n-1) x (waveGap + WAVE_RELEASE_SECONDS)`
seconds of run time, and nothing about the board can move it**
(`Sim.waveStartTime`). At the shipped 15-second gap that is a wave every
**18.5s** — so the fifty-wave script is 910s of schedule whatever map it
is played on and whatever difficulty it is played at, wave 1 at 3s and
wave 50 at 909.5s (15:10). The income curve and the tier gates are authored
against this cadence (`docs/economy.md`): change the gap and change them with it.

It used to be a lower bound rather than a schedule. One wave was loaded at a
time and the next waited for the last to finish spawning, so a map whose drop
zones could not pass wave forty in 3.5 seconds ran LONGER — by minutes, on a
tight board at a high rung, with nothing on screen saying why. **Several waves
release at once now** (`Sim.live`): a wave that has outrun its doors keeps
releasing while the one behind it lands, oldest first. Congestion costs a
thicker field and never a longer run.

What that means when you author:

- **The gap is the whole of the pacing.** `waveGap` plus
  `WAVE_RELEASE_SECONDS` is the cadence, exactly, and the run's length is
  arithmetic on it. Nothing else — not a wave's size, not a map's door
  count — moves the clock.
- **A wave's SIZE decides how hard it arrives, never how long it takes.**
  Author a wave the doors cannot pass in 3.5s and you are authoring an
  overlap on purpose: two waves on the field together, which is a real and
  usable difficulty lever. It just no longer buys you extra minutes. **Every
  wave of the shipped script is now such a wave**.
- **Everything else in the run reads the same clock** — a survive's
  deadline, an intercept's launches (`Sim.runCrossers`), the tide's cycles,
  and the sandbox's jump (`Sim.skipToTime`, `time M:SS` in the console).

## The tide: the script is infinite

**Switched off for now, by the mission rather than by a flag.** Every
swarm map (the swarm world and the bank, `game/levels.ts` `SWARM_HOLD`)
is a hold of the script's own length, and a hold that has staged its
count does not turn the tide (`Sim.tideTurns`): wave 50 is the last
wave, the run is won when it is down, and the fiftieth wave brings the
Sovereign (`HoldMission.finale`, staged by `Sim.stageOne` — the one place
an objective body rides a wave). The machinery below is intact and any
mission that is not a finished hold still plays it.

A script is a finite document and a run is not. **When the cursor reaches
the last wave and the mission is still open, the last `TIDE_CYCLE_WAVES`
(eleven — waves 40 to 50 of the fifty-wave script) go again**, and every
cycle adds `TIDE_LEVELS` to the enemy level every body spawns at
(`Sim.loadStep`). `TIDE_LEVELS` is `LEVELS_PER_DOUBLING` in
`game/ladder.ts`, so the climb is **x2 health, then x4, then x8**, with no
ceiling. The HUD says which cycle it is on once it is past the first.

Three things about it that are load-bearing when you author:

- **A level is health and nothing else** (`unitHpAtLevel`). Same speed,
  same armour, same drop, same silhouette. The swarm that comes back is
  the swarm the player just beat, and the only question it asks is
  whether the guns bought so far still cut it. That is why levels are the
  knob and counts are not — a count ramp past wave 10 would change the
  picture on screen and the cost of the frame with it.
- **More than one wave.** The tail of a script is its shape — a lull, a
  spike, a boss — and a finale sent on a loop is a metronome. The cycle
  keeps the rhythm you wrote, so **the last eleven waves are the ones that
  get played forever**: author them as a stretch that stands repeating.
- **The scrap does not double with the health.** A kill pays off the
  body's AUTHORED pool (`game/economy.ts`), so income is flat across the
  climb and the tide is where a board stops being able to buy its way
  out. That is the shape an endless mode wants; it is also why the tide is
  not a farm.

## Missions

The mission is the objective (`docs/mission-design.md` for the design, the
`Mission` union in `game/levels.ts` for the shapes). What the script owes
each of them:

- **hold** — break `waves` waves with the core standing; a wave counts
  when every body it sent is down (`Sim.wavesCleared`). Unset, the target
  is the script's own length, which is what every swarm map plays. **Ask
  for more waves than the document holds and the hold plays the tide** —
  that is how a hold map gets the infinite climb. A `finale` names an
  objective body the last wave brings; the swarm maps name the Sovereign.
- **survive** — last `minutes` on the clock. The tide is what keeps the
  board honest for however long that is.
- **intercept** — destroy `kills` crossers before they leave. The waves
  are pressure at the core underneath a mission happening elsewhere, so
  they must not run dry while the run is still going.

There are no lives under any of them: the core carries `CORE_HP` and the
run is lost when it falls.

## The price bands

There is no tier gate inside a run: whatever the save owns it may place
from wave 1. The economy is the swarm's — every kill drops its tier's
scrap and nothing else pays anything (`game/economy.ts`) — so a script
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
- **A wave cannot send an objective.** The Sovereign and the Borer's
  three pieces are `OBJECTIVE_KINDS` (`game/levels.ts`): a mission puts
  them on the board and nothing else can, so `waveGroups` strips them from
  a wave whatever the document says and the level editor does not offer
  their rows. The boss used to be typed into the last wave as the campaign's
  curtain; a script that loops forever has no curtain to be, and a boss on
  a lap counter is ordinary traffic at double health. The bodies are not
  retired — every line of them is live, and they are waiting on the
  missions that field them (`docs/mission-design.md`).
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
