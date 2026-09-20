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
- **The objective bodies belong to missions, not waves.** The Sovereign,
  the Borer and the Railgun are `OBJECTIVE_KINDS`
  (`game/levels.ts`): things the run has to go and deal with, which is the
  shape an objective has. A wave cannot send one — `waveGroups` strips them
  — and the two that are EVENTS wear a **health bar** at the top of the
  screen while they are on the field (`Sim.objectiveBars`), stacked
  downward when there are several. A Borer gets ONE bar over its whole
  twenty-piece pool. The siege's ten do not get bars: ten bars is a wall of
  chrome, and what a player needs off that mission is a COUNT.
- **And a mission may post a body rather than send one.** Everything the
  script sends walks at the core, because every route on the board runs
  there — that is what makes the swarm a tide rather than an army, and it
  is not a thing a kind opts into. `Sim.garrisonUnit` is the other way to
  put a body down: it holds a circle, fights whatever the player builds
  inside it, and never takes a step outside. `Sim.plantUnit` is the same
  idea at radius zero — bolted down, unshoveable, unknockbackable. Neither
  is a property of a KIND, so any body can be posted and a mission that
  wants a camp, a nest or a picket writes a roster rather than a unit.

## What a mission has to work with

The run has ONE VERB: spend scrap to place a structure. Nothing is
produced, nothing is commanded, nothing is hidden — a player sees the
whole board from wave 1 and can put a turret anywhere on it. So a mission
cannot ask for scouting, micro or an army. It can
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

**Three of the eight.** Two of them are the PAIR — one crosser the board
has to stop and one it has to keep alive. The third is the one that does
not cross at all: it stands still, and it is shooting at you.

Coldline plays *intercept the crosser* — offered as **Borer Intercept**, since the picker names a row
after its mission and not after its ground: seven Borers — twenty-car
boring machines — cross the map on two fixed roads while the wave script
runs at the core underneath, and a run that lets two of them reach the far
side is over whether or not the base is still standing.

**The plain one is no longer among them.** Confluence plays *hold the
line*, it is still the board the campaign's numbers are tuned against, and
it is off the menu (`PLAYABLE_WORLD_IDS`) for the reason this whole
document exists: a hold's assignment is the script, the script goes round
forever, and a board that cannot be finished is not a mission. It comes
back the day it is given one.

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
| what the player sees | the objective pane in `components/Animechs.tsx`, the road overlay in `Game.drawMissionRoads`, and the arrival ping on the corner map |

**Thornway plays *escort the crosser*, which is Coldline in a mirror** —
offered as **Hauler Escort**: one Hauler of the player's own, twelve tiles
square, standing outside the core from the first frame of the run and
rolling out of its depot halt forty-five seconds in, then crossing twelve
hundred cells of double S at 1.6 tiles a second to the post in the far
corner, stopping four more times on the way to mend. Losing it loses the
run.

It is **on the board before it moves** on purpose. An escort is a thing
the player is asked to spend against, and until it exists there is nothing
to spend against: a cart that materialises ninety seconds in is a cart
whose first leg is defended by whatever happened to already be there. The
depot is the halt at fraction 0 (`EscortMission.halts`), so the standing
start is the same mechanism as every other stop rather than a case written
for the opening. It cost almost no new mechanism and taught the most about
the first one — everything the intercept needed in order to be a mission
(an authored line, a clock read off run time, a body that is not the
swarm, a bar that is the objective) the escort needed too, and the only
thing it added was a body the SWARM shoots rather than one the board does.

| | |
|---|---|
| `EscortMission` | `game/levels.ts` — the type, and Thornway's authored numbers: how many carts, how many may be lost, when the first rolls, which road, where it halts and what it mends |
| the cart | `game/levels.ts` (`CONVOY_HP` and the numbers beside it) and `game/convoyArt.ts` (the drawing) |
| what happens | `Sim.runConvoys`, `launchConvoy`, `updateConvoys`, `damageConvoy`, and the branches in `nearestStructure`, `structureAt`, `inReach` and `damageTower` |
| what keeps the swarm off it | `Sim.aimIsConvoy` — the cart is a target and never a destination |

**Sear plays *venture and destroy*, and it is the first mission that
comes to you** — offered as **Railgun Siege**: ten enemy railguns in four
batteries round the core past its own light, rising one
battery at a time on the clock (2:00, 6:00, 10:00, 14:00 — one gun, then
two, then three, then four), each guarded, and every one of them firing at
the base and at nothing else for as long as it stands. The run is over when
all ten are down, or when the core is.

What the archetype turned out to need, and what each piece is answering:

- **THE OBJECTIVE HAS TO SHOOT BACK AT THE THING YOU CARE ABOUT.** This is
  the archetype's whole problem: a static thing that waits to be killed is
  a thing a player kills at their convenience, on a board that only gets
  richer. A railgun is aimed at the core from the first second it exists
  (`UnitStats.bombard`), ten health a second each, and the arithmetic lands
  exactly — a run that answers nothing at all is at zero core at 14:00,
  which is the tick the fourth battery finishes arriving. Every other lever
  the archetype could have pulled (more health, better drops, a timer on
  the objective) is a rule about the objective; this one is a rule about
  the STAKE, and it is the only kind of pressure that competes with a wave
  clock that never stops.
- **IT RISES IN SECTIONS, AND THEY DO NOT WAIT.** Ten emplacements on the
  board at wave one is one affordability question asked once, and a player
  knows the answer before they have played the map. Four sections on an
  absolute clock is the same question asked four times, each one harder —
  and because the next one comes whether or not the last is down, falling
  behind COSTS: a board that keeps up fights one battery at a time and a
  board that does not fights six at once. The obvious other rule, "the next
  rises when the last falls", makes the mission easier the worse you are at
  it, which is the wrong direction for every clock in this game.
- **A POSTED BODY IS A DIFFERENT KIND OF BODY, and it had to be built
  first.** `Sim.garrisonUnit` (above) holds a body to a circle: it fights
  what you build in there and cannot be pulled out of it. That last clause
  is the design, not the implementation — a guard that could be baited home
  would be a wave with extra steps, and this game already has a wave. The
  shipped siege posts nothing today; the mechanism is here for the day one
  wants to.
- **THE DISTANCE IS THE COST AND NOT THE TERRAIN.** Every battery stands
  well out past the base's own ground, so the first can be answered by the
  longest gun in the game (railhead, sixty-two tiles) from near home and
  everything after that is a gun standing where it defends nothing.
- **WHY THIS BOARD.** Sear's core is hard against the east edge of the
  caldera and every approach is from the west, so the four batteries are
  an ARC and not a ring: one due west, one north-east over the rim, and
  two on the long shoulders. The sea takes the south, and a mission that
  put an emplacement there would be putting one in the water.
- **WHERE THEY STAND IS THE MAP'S, NOT THE CODE'S.** Every gun is a
  `railgun` mark on the map document, placed in the map editor
  (`docs/mission-marks.md`): the cell, and the section it rises in. The
  mission spec keeps the clock and nothing else. **The guns are placed,
  not rung** — the sim used to spread a count of them round a post, and a
  ring is a shape where a position is a decision about cover and approach.
- **NOTHING STANDS OVER THEM.** A battery is guns and the ground they are
  on; what a run has to beat to reach one is the wave walking at the core
  while it goes.
- **THE POSTS ARE ON SCREEN FROM WAVE ONE**, empty, with the number of
  emplacements that will rise in each and a dial on the ring counting down
  to the minute they do (`Game.drawMissionPosts`). No fog means no
  surprises, and the question being asked is "will you have paid for a
  position at the south-west by two minutes" — which is not a question you
  can ask a player who cannot see where the south-west is.

| | |
|---|---|
| `RazeMission` / `RazeSection` | `game/levels.ts` — the type and the clock: when the first battery rises and how far apart they come. `RazeSection.wave` is which rising a section belongs to, so several may share one |
| the emplacements | the map's `railgun` marks, one a gun (`game/missionMarks.ts`, `missions.ts siegeFromMarks`) |
| the railgun | `game/levels.ts` (`railgun`, `UnitStats.bombard`), `game/weapons.ts` (the bombard row) and `game/wardenArt.ts` (the drawing). It is **six tiles square** — the hitbox, the grid it is drawn on and the turret plate under it are one number (`RAZE_PLATE_TILES`), so an emplacement reads as the enemy turret it is |
| the Wardens | four heavy BODIES that walk at the core like the rest of the swarm (`levels.ts` `WARDEN_NAME`, the `warden` tree). No wave may send one and no mission plants one, so nothing puts one on a board today |
| a body that holds ground | `Sim.garrisonUnit`, `Sim.plantUnit`, and the `ugar` arrays — the general mechanism, of which this mission is the first customer |
| what happens | `Sim.runSections`, `raiseSection`, `clearNear`, `fireBombard`, and the lines in `won()` and `removeUnit` |
| what the player sees | the objective pane in `components/Animechs.tsx`, and the post overlay in `Game.drawMissionPosts` |

The other five archetypes have a MAP each and no rule yet (`WORLDS`, the
mission sketches), and so do the holds. **Those boards are SHELVED and not
in the game**
(`PLAYABLE_WORLD_IDS` in `game/levels.ts`): terrain that is drawn with no
reason to be played, carrying a placeholder hold. `npm run check` holds
them to constructing without throwing and to nothing else — a shelved
board is allowed to be unfinished, which is what shelving it says.

## The eight archetypes

A map carries ONE of these. Two stacked reads as noise, and the player
stops being able to tell which thing is asking for the money.

### 1. Venture and destroy — BUILT, on Sear

Kill a set number of static things away from the base.

Variants: super-elites · non-attacking buildings that buff the swarm ·
shield projectors denying your ground · railguns chipping the base from
out of range · nests that spawn forever once woken · suppressors that
darken your zones.

Sear plays the railgun variant — see **What is built** above for what it
does with it and what the shape needed. The other five variants are the
same three pieces in different arrangements (a posted body, a schedule, and
a reason it cannot be ignored), so none of them needs new machinery: a nest
is `garrisonUnit` on a spawner, a suppressor is one that writes to the
power grid, and a super-elite is a section of one body with no emplacement
in it.

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
- **EVERY LAUNCH IS HEAVIER THAN THE LAST** (`wormRamp`) — and the step
  itself grows: x1.00, x1.35, x1.95, x3.01, x4.99 across the pattern,
  with the spare at x8.82 past that. This is the mission's price and not
  just its shape: a board gets richer between launches, faster towards
  the end, and a train worth what the last one was worth is a train the
  player has already solved. `WORM_RAMP_GROWTH` sets the opening,
  `WORM_RAMP_ACCEL` the back half alone.
- **AND THE WHOLE TRAIN IS A SHARE OF THE TIER.** A Borer is an objective,
  so its pool carries `tierObjectiveHpScale` like the Sovereign and the
  siege do — a quarter at Incursion, three quarters at Scourge, all of it
  from Nemesis up (`docs/difficulty.md`). The ramp rides on top of that
  share: the tier says how big a train is, the ramp how much heavier this
  one is than the last.
- **It walks an AUTHORED line and it walks it kinematically.** Not the
  flow field, not the crowd shove, not wall collision — a position read
  off a polyline at an arc length. Everything else on the board ends up
  at the core, so the one thing a crosser must never do is drift toward
  it, and a Borer wedged in a corner by a knockback would make "did it
  get across" a question about physics.
- **The roads are on screen from wave one.** Drawn under everything, dark
  and dashed, with an arrowhead on the last leg — and now painted on the
  GROUND as well, as a rail bed (`game/railArt.ts`). The two missions get
  two railways, because the overlay already says whose line it is in red
  or amber and the ground should not contradict it: Coldline's is the
  swarm's heavy main line, cold and broad-gauge; Thornway's is a works
  tramway, narrow and timber-sleepered, which the Hauler drives rather
  than runs on. A mission with no fog
  in it has no discovery in it either (see above), so a road a player
  found out about by watching something walk down it would be a different
  and worse mission.
- **The line is on an eight-heading lattice and every corner is 45
  degrees**, checked at load by `roadProblems`. That is what makes the bed
  drawable: 0/45/90/135 are the only headings a square pixel grid draws
  exactly, so a rail piece is painted once and stamped with a quarter
  turn. The consequence for authoring is that the LINE COMES FIRST and the
  terrain is cut to it afterwards (`scripts/maps/railbed.mjs`), which is
  the reverse of how Coldline's roads were originally traced.
- **The allowance needs a SPARE.** The pattern sends exactly as many
  crossers as the mission asks you to kill, so the one leak the rules
  permit would be a lie without an extra launch to make it back — and the
  spare is only sent to a run that needed it, so a clean run ends when
  the pattern does.
- **It is the first mission that can be failed with the core standing.**
  Two through and the count can never be reached, so the run is over at
  that moment rather than twenty minutes later. The loss screen had to
  learn to say which of the two things went wrong.

### 3. Escort the crosser — BUILT, on Thornway

The same shape, friendly: it crosses, and it must survive.

Variants: a merchant caravan that pays scrap · refugees · a slow ally
that clears an objective on arrival · a supply run of your own.

What Thornway does with it, and what the mirror turned out to need:

- **The cart is a STRUCTURE, not a unit.** "The swarm shoots it exactly
  the way it shoots a turret" is the whole specification of how the two
  sides meet, and a TURRET is what that sentence is about — so every gun
  on the swarm's side already knows what to do with it, and there is no
  second targeting path to keep in step with the first. What it is not is
  a member of the tower list: nothing counts it, sells it or selects it,
  it claims no ground and it blocks no route.
- **Nothing SEEKS it, and that line is the mission.** No body routes to
  it, dives at it or charges it. A cart that pulled the swarm off its
  route would be a second core — the player would defend one thing
  instead of two and the base would go quiet, which is a different and
  much worse map. So the pressure on the cart is a fact about WHERE THE
  ROAD CROSSES THE SWARM'S ROUTE: a fact about the terrain, which is the
  thing the player is buying guns against.
- **A moving objective needs PLATING, not health.** The first cut had a
  building's pool and a building's armour and died inside four minutes to
  the crowd walking past it, because the road leaves the core and its
  opening stretch runs through the traffic walking at the base. Forty
  plating puts every light body on the ten-percent floor and leaves
  calibre and rot as the real threats, which is the difference between a
  mission about how many bodies the map happens to route past the road
  and a mission about what the player brought.
- **The halts are the mercy AND the trap.** It stops four times, mends a
  third of its pool at each, and is the easiest target on the board while
  it does. Every halt is therefore a position that had to be bought
  before the cart got there — the archetype's own sentence about
  opportunity cost, said in the only grammar this game has.
- **The road's requirement is the opposite one.** A Borer's line is
  straightened until it barely bends, because a seventy-tile train kinks
  at a corner and because a battery has to be committed to it a long way
  ahead. A cart is one body that turns on the spot, so its road keeps
  NINETEEN corners against Coldline's six — every bend a place the swarm
  crosses the line while the cart is still on it. What the lattice took
  off it was the 88-degree hairpin and nothing else.
- **Three grid reads had to learn about it, and none of them failed
  loudly.** The cart is not in the occupancy grid, because it moves — and
  three separate things use that grid as their "is this still standing"
  test: the target search's bounding box (which is the box the player's
  BUILDINGS stand in, and a cart fifty tiles up the road is outside it),
  the weapon's reach check before it pulls a trigger, and the shot's
  arrival test in flight. With any one of them unpatched the swarm picked
  the objective, held the objective, and never scratched it. **A moving
  structure fails every test written for a stationary one**, quietly.

### 4. Hold remote ground

Own a place away from the base for a duration.

Variants: capture points granting a global buff · ground that must be
kept clear of the swarm · zones that flip back the moment you leave.

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

## Placing a mission's furniture

Geometry an author places by hand — the buff towers on Coldline today —
lives in the map document and is authored in the map editor, off one
registry. See **[mission-marks.md](mission-marks.md)**; it is also the thing
to extend when a new mission needs something put on a map.

## What the map owes the mission

A mission is authored in the terrain before it is authored in code. The
map has to supply:

- **Somewhere the objective is, that is not on the way to anything.** A
  gun placed there defends nothing, which is what makes buying it a
  decision.
- **A reason the objective cannot be answered by one turret.** It fights
  back, it moves, it is only open for a moment, or it takes a damage type
  the player has to have drafted.
- **A visible consequence for skipping it.** Ignoring a mission is a
  legitimate line to play; it may not be a free one.
