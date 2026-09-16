# Mission design

What a map asks a run to DO. **It is the whole of what winning means** —
there is no longer anything else a run can finish.

`authoring-maps.md` is the terrain; this is what the terrain is for. A
mission is a per-map objective, and the map is built around it.

## The waves stopped being the objective

The game used to be won by outlasting a document: fifty authored waves,
and a run that cleared the fiftieth had cleared the map. That is retired.
**The script is an engine now** — when it reaches its last wave and the
mission is still open it replays its last eleven, one doubling of enemy
health heavier every cycle, forever (`Sim.loadStep`, the tide;
`docs/authoring-waves.md`). A script cannot run out underneath a run, so
nothing can be finished by waiting.

Three consequences for everything below:

- **Every map owes an objective.** A board with no mission the sim can
  meet is a board that can only ever be lost, and `npm run check` fails
  a playable world that has one (`scripts/check.mjs`, the `worlds` gate).
- **"Hold the line" is a NUMBER, not a document.** The classic assignment
  survives as `hold { waves }` — break that many waves with the core
  standing — and unset it means the script's own length, which is what
  Confluence plays. Ask for more than the document holds and a hold plays
  the infinite climb like anything else.
- **Every progress bar reads the mission** (`missionProgress` in
  `game/levels.ts`, one number the sim publishes and every panel draws).
  A bar drawn off the wave number would fill to the brim and start again.
- **The objective bodies belong to missions, not waves.** The Sovereign
  and the Borer are `OBJECTIVE_KINDS` (`game/levels.ts`): one thing the
  run has to go and deal with, which is the shape an objective has. A wave
  cannot send one — `waveGroups` strips them — and each wears a **health
  bar** at the top of the screen while it is on the field
  (`Sim.objectiveBars`), stacked downward when there are several. A Borer
  gets ONE bar over its whole twenty-piece pool.

## What a mission has to work with

The run has ONE VERB: spend scrap to place a structure. Nothing is
produced, nothing is commanded, nothing is hidden — a player sees the
whole board from wave 1 and can put a turret anywhere their beacon zones
reach. So a mission cannot ask for scouting, micro or an army. It can
only ask the player to **spend somewhere other than the base**, and the
whole of its difficulty is the cost of doing that.

Three consequences, and every archetype below is shaped by them:

- **THE COST IS ALWAYS OPPORTUNITY COST.** A sale returns nothing
  (`SELL_REFUND`), so a gun bought for an objective is gone from the
  defence for the rest of the run. That is the price, and it is the only
  price that scales — scrap income does not gate anything by wave 20.
- **NO FOG MEANS NO SURPRISES.** The objective is on screen from the
  first wave. Its pressure is affordability and timing, never discovery.
  A mission whose twist is that the player did not know is not a mission.
- **A MISSION MUST COMPETE WITH THE WAVE CLOCK.** "Kill it eventually"
  is not an objective. The objective needs a deadline, a window, or a
  cost that climbs while it is ignored — and the clock it is competing
  with does not stop, because the swarm gets heavier for as long as the
  run lasts (the tide).

## What is built

**Two of the eight, counting the plain one.** Confluence plays *hold the
line* — fifty waves broken with the core standing, the assignment the
whole campaign is tuned against. Coldline plays *intercept the crosser*:
seven Borers — twenty-car boring machines — cross the map on two fixed
roads while the wave script runs at the core underneath, and a run that
lets two of them reach the far side is over whether or not the base is
still standing.

Where it lives, since a mission is spread across the file the way one has
to be:

| | |
|---|---|
| `Mission` / `InterceptMission` | `game/levels.ts` — the union, and Coldline's authored numbers: how many, on which road, how far apart, how many may get past |
| the objective's fraction | `missionProgress` / `missionCount` in `game/levels.ts` — one definition, read by the sim and the HUD alike |
| the roads | `game/missions.ts` — the hard-coded lines, in cells, per map id |
| the Borer | `game/levels.ts` (`WORM_CHAIN`, the three kinds) and `game/wormArt.ts` (the drawing) |
| what happens | `Sim.runCrossers`, `launchCrosser`, `updateCrosser`, `leakCrosser`, and the two lines in `won()` and `lost()` |
| whether the script loops under it | `Sim.tideTurns` — every mission but a hold that has staged its count |
| what the player sees | the objective pane in `components/Animechs.tsx` and the road overlay in `Game.drawCrosserRoads` |

The other six archetypes have a MAP each and no rule yet (`WORLDS`, the
mission sketches). **Those boards are SHELVED and not in the game**
(`PLAYABLE_WORLD_IDS` in `game/levels.ts`): terrain that is drawn with no
reason to be played, carrying a placeholder hold. `npm run check` holds
them to constructing without throwing and to nothing else — a shelved
board is allowed to be unfinished, which is what shelving it says.

## The eight archetypes

A map carries ONE of these. Two stacked reads as noise, and the player
stops being able to tell which thing is asking for the money.

### 1. Venture and destroy

Kill a set number of static things away from the base.

Variants: super-elites · non-attacking buildings that buff the swarm ·
shield projectors denying your ground · railguns chipping the base from
out of range · nests that spawn forever once woken · suppressors that
darken your zones.

### 2. Intercept the crosser — BUILT, on Coldline

Something moves across the map ignoring the base, and must die before it
leaves.

Variants: an armoured convoy · a fleeing courier · a roaming beast · a
builder planting enemy structures as it walks · a herd that must be
thinned.

What Coldline does with it, and what the shape turned out to need:

- **A crosser is a CHAIN, not a body.** The Borer is twenty separately
  shootable pieces laid nose to tail — seventy tiles of train — and it
  counts as destroyed only when every one of them is down. One hurtbox
  on that silhouette is a mission about hitting a nose; twenty is a
  mission about how much of a road you have under fire, which is the
  thing the archetype is actually asking the player to pay for.
- **NOTHING SLOWS IT AND NOTHING BLOCKS IT.** A Borer is `unslowable`
  (`UnitStats`): a douser on the line still soaks it, still douses a fire
  on it and still hands the electric ammunition its bonus, but it buys no
  seconds. And it obstructs nothing either — a footprint may be dropped
  on a train that is passing over the spot (`board.ts bodiesClear`),
  because the train walks through buildings and would otherwise be
  refusing the player ground on the one map about buying ground. The
  arrival is a clock the road advertises from wave one; the only answer
  to it is killing the thing.
- **EVERY LAUNCH IS HEAVIER THAN THE LAST** (`wormRamp`) — 0.7 of the
  pool at the first and 1.3 at the fifth, with the spare past that. The
  five launches add up to the same total health a flat pool would, so
  this is the mission's shape rather than its price: a board gets richer
  between launches, and a train worth what the last one was worth is a
  train the player has already solved.
- **It walks an AUTHORED line and it walks it kinematically.** Not the
  flow field, not the crowd shove, not wall collision — a position read
  off a polyline at an arc length. Everything else on the board ends up
  at the core, so the one thing a crosser must never do is drift toward
  it, and a Borer wedged in a corner by a knockback would make "did it
  get across" a question about physics.
- **The roads are on screen from wave one.** Drawn under everything, dark
  and dashed, with an arrowhead on the last leg. A mission with no fog in
  it has no discovery in it either (see above), so a road a player found
  out about by watching something walk down it would be a different and
  worse mission.
- **The allowance needs a SPARE.** The pattern sends exactly as many
  crossers as the mission asks you to kill, so the one leak the rules
  permit would be a lie without an extra launch to make it back — and the
  spare is only sent to a run that needed it, so a clean run ends when
  the pattern does.
- **It is the first mission that can be failed with the core standing.**
  Two through and the count can never be reached, so the run is over at
  that moment rather than twenty minutes later. The loss screen had to
  learn to say which of the two things went wrong.

### 3. Escort the crosser

The same shape, friendly: it crosses, and it must survive.

Variants: a merchant caravan that pays scrap · refugees · a slow ally
that clears an objective on arrival · a supply run of your own.

### 4. Hold remote ground

Own a place away from the base for a duration.

Variants: capture points granting a global buff · a beacon that must
stay powered · ground that must be kept clear of the swarm · zones that
flip back the moment you leave.

### 5. Protect the second thing

A fragile static structure that is NOT the base, which the swarm
prioritises over the base.

Variants: an ally outpost paying income · a cage or prisoner · a device
charging toward a reward · several at once, in different directions.

### 6. Race the enemy

Take it, or the swarm takes it, on a visible deadline.

Variants: contested positions that become enemy gun platforms · a
resource that funds whoever reaches it · a structure that changes hands
more than once.

### 7. Stop the ritual

The swarm is completing something on a timer, and it must be
interrupted.

Variants: a charging superweapon · a summoning that scales the boss · a
tunnel being dug toward the base · a broadcast buffing every wave until
it is silenced.

### 8. Pick one

Mutually exclusive investments the run cannot both afford.

Variants: two expansion arms · three blessings with different drawbacks
· which of three threats to ignore · which swarm family to shut out of
the run entirely.

## What the map owes the mission

A mission is authored in the terrain before it is authored in code. The
map has to supply:

- **Somewhere the objective is, that is not on the way to anything.** A
  gun placed there defends nothing, which is what makes buying it a
  decision.
- **A beacon zone that reaches it, at a price.** The node's cost is the
  mission's entry fee and the clearest number to tune.
- **A reason the objective cannot be answered by one turret.** It fights
  back, it moves, it is only open for a moment, or it takes a damage type
  the player has to have drafted.
- **A visible consequence for skipping it.** Ignoring a mission is a
  legitimate line to play; it may not be a free one.
