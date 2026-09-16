# Mission design

What a map asks a run to DO, beyond surviving its fifty waves.

`authoring-maps.md` is the terrain; this is what the terrain is for. A
mission is a per-map objective, and the map is built around it.

## What a mission has to work with

The run has ONE VERB: spend scrap to place a structure. Nothing is
produced, nothing is commanded, nothing is hidden — a player sees the
whole board from wave 1 and can put a turret anywhere their relay zones
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
  cost that climbs while it is ignored.

## The eight archetypes

A map carries ONE of these. Two stacked reads as noise, and the player
stops being able to tell which thing is asking for the money.

### 1. Venture and destroy

Kill a set number of static things away from the base.

Variants: super-elites · non-attacking buildings that buff the swarm ·
shield projectors denying your ground · railguns chipping the base from
out of range · nests that spawn forever once woken · suppressors that
darken your zones.

### 2. Intercept the crosser

Something moves across the map ignoring the base, and must die before it
leaves.

Variants: an armoured convoy · a fleeing courier · a roaming beast · a
builder planting enemy structures as it walks · a herd that must be
thinned.

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
- **A relay zone that reaches it, at a price.** The node's cost is the
  mission's entry fee and the clearest number to tune.
- **A reason the objective cannot be answered by one turret.** It fights
  back, it moves, it is only open for a moment, or it takes a damage type
  the player has to have drafted.
- **A visible consequence for skipping it.** Ignoring a mission is a
  legitimate line to play; it may not be a free one.
