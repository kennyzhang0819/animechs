# The fog

Mindustry's fog of war, ported whole from `mindustry.game.FogControl` and
`mindustry.graphics.FogRenderer` — `game/fog.ts` for the bits, the `drawFog`
pass in `game/renderer.ts` for the picture, `Game.updateFog` to drive it.

## Two sets of bits, three layers on screen

Upstream keeps two independent sets per team, and so does this:

| set | what it is |
| --- | --- |
| `discovered` | every cell an eye has EVER stood within reach of. It only ever grows; nothing but a new map clears it. |
| `visible` | the cells an eye covers RIGHT NOW. Rebuilt from nothing twenty-five times a second. |

What the frame draws is two washes over the map — the dynamic buffer at
`FOG_DYNAMIC_ALPHA` and the static one over it at `FOG_STATIC_ALPHA` — which
lands as three layers:

| layer | when | how dark |
| --- | --- | --- |
| **active** | something of yours is looking at it right now | clear |
| **seen** | it has been looked at, and is not now | half black |
| **never seen** | nothing has ever looked at it | about seven tenths |

**NEVER SEEN IS NOT BLACK, AND THAT IS THE ONE NUMBER HERE THAT IS NOT
MINDUSTRY'S.** Upstream's `staticColor` alpha is 1 and undiscovered ground is a
hole with a map somewhere inside it. This board is three quarters undiscovered
for the first minutes of a run, and a player cannot plan a defence on ground
they cannot see the shape of — so the run opened with the player buying the map
back rather than deciding anything about it. At 0.4 over the half-black below
it, the rock, the water and the moss all still read. What the two dark layers
say is how *current* your knowledge of a place is, not whether you have any.

The gap between the two is small on purpose: enough to read where you have
been, nowhere near enough to make the rest a wall.

**THE HILLS ARE STILL SHADED UNDER IT.** They were not, while never-seen ground
was flat black: a dark hill core inside a lit range read as fog that had never
been lifted, so the fog switched the hill darkness off and was the only black a
run wore. Now that every layer is a wash, a hill's own shading is the only thing
left saying which of that visible terrain is *height*. The two stack, and a
range under the fog is simply the darkest ground on the map — which is what it
is.

## What is hidden

**A BODY IN THE FOG IS NOT THERE.** Every body on this board is the swarm's, and
one of theirs is drawn only where something of the player's is looking right
now — not the body, not its shadow, not its wake, not its shot, not the puff
where it was hit, and not its health bar. The wash alone would leave a body
half-visible in the grey, and a body in the grey is a body the player was
promised they cannot see. The minimap keeps the same promise.

**A BUILDING IS DRAWN ONCE IT HAS BEEN SEEN** and stays drawn after, the way a
remembered structure does in StarCraft: the swarm's turrets and the map's shield
towers sit under the grey where you last looked at them. Never seen, never
drawn.

**NOTHING IS HIDDEN FROM THE SIM.** The fog is a picture and not a rule — a
turret shoots what it always shot, a body walks where it always walked, and a
placement is refused for the reasons it always was. It was a rule once, when it
lived in `Sim`; it is not one now.

## What lights it

Everything that lights the board is the player's, and all of it is still except
the last:

- **the core**, 34 tiles (`CORE_VISION_CELLS`).
- **every turret you own**, out to the whole of its LIVE range
  (`VISION_OF_RANGE` is 1, Mindustry's own `fogRadiusMultiplier`), with a floor
  of `VISION_BUILT_CELLS` so a short gun is not blind. An upgrade that lengthens
  a gun lengthens what it sees.
- **a beacon you have bought**, over the whole disc it opens to building
  (`BEACON_POWER_R`): ground a player may spend on is ground they are owed a
  look at.
- **a beacon you have not**, over the small ring it has always carried on the
  field (`BEACON_VISION_R`). A lamp on a mast lights its own hill whoever owns
  it, and a beacon nobody can find is a beacon nobody can decide to buy.
- **the escort's hauler**, 16 tiles (`CONVOY_VISION_CELLS`) — the one eye on
  this board that moves, and deliberately shorter than a turret's: a cart that
  lit its whole route as it went would be scouting the map for free.

Nothing stops sight. There is no line of sight and no shadowing, exactly as
upstream: a fog radius is a radius.

## What the mission is owed

**A MISSION HAS NO SURPRISES IN IT** (`docs/mission-design.md`), and the fog does
not get to put any back. At the level's birth `Game.seedFog` stamps the STATIC
set — and only the static set — along every piece of a mission's geometry:

- the roads a crosser is sent down and the road the hauler is pushed up, as a
  corridor `MISSION_ROAD_CELLS` either side of the line;
- the circles a siege will rise in, and each emplacement the map places;
- the ground a garrison holds;
- every point mark a map stands on the board, at `MISSION_INTEL_CELLS`.

Stamping the static set and nothing else is what makes this read as
INTELLIGENCE rather than as sight: the ground is drawn in the grey of remembered
ground from the first frame, and whatever is standing on it is not drawn at all
until something of the player's actually looks. The briefing says **where**,
never **what**.

## How it is cheap

**THE STATIC SET IS EVENT-DRIVEN, never rebuilt.** Every eye that appears or
moves onto a new tile pushes one event — a circle stamped into `discovered` and
handed to the renderer for its own accumulating buffer. That is what makes a
fast-moving eye leave an unbroken trail rather than a row of dots at the
rebuild's own rate, and what makes a standing board free. `Game.updateFog` is
the TileChangeEvent and the `Unit.lastFogPos` check in one: an eye whose tile
and reach it has seen before costs a set lookup and nothing else.

**THE DYNAMIC SET IS REBUILT AT MOST 25 TIMES A SECOND**
(`FOG_DYNAMIC_INTERVAL`), and only when something has actually moved. It is
measured on the SIM's clock rather than the wall's, so a run that is paused,
fast-forwarded or replayed headless sees the same fog either way.

**THE RASTER IS A MIDPOINT CIRCLE**, span for span the one `FogControl` uses, so
a cell either side of the rim falls on the same side of it here as it does
upstream. The picture is not that raster: it is a twenty-sided polygon drawn at
the eye's TRUE floating position into a texel-a-tile buffer, magnified
bilinearly and quantized into bands by `FOG_FS`. The look is those three
together — give the buffer more texels and the bands narrow into a hard circle;
drop the quantization and the ramp reads as a blur.

The rules are deliberately the more generous of the two: the dynamic raster is
stamped one tile wider than the polygon is drawn ("always +1 to keep up with
visuals"), so nothing is ever shown that the rules say is hidden.

**A DRIVER THAT REFUSES THE FRAMEBUFFERS** falls back to `drawFogCells`, which
uploads the bits straight as a cell-a-texel texture and sends only the rectangle
that changed. It is a worse-looking fog and it is not optional: a frame with no
fog on it shows the player the whole map.
