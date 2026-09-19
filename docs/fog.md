# The fog

Three layers of dark over the ground, and **nothing hidden by any of them**.

The fog is a picture, not a rule. It lives entirely on the drawing side
(`game/fog.ts`, drawn by `Renderer.drawFog` and `Game.paintMinimapFog`) and the
sim never reads it: a turret shoots what it always shot, a body walks where it
always walked, and every count on the HUD is the count it always was. What the
fog changes is how much of the board the eye is being asked to read at once.

## The three layers

| layer | when | how dark |
| --- | --- | --- |
| **active** | something of yours is looking at it right now | clear |
| **seen** | it has been looked at, and is not now | semi dark |
| **never seen** | nothing has ever looked at it | semi dark, and darker |

**NEVER SEEN IS NOT BLACK, AND THAT IS THE WHOLE SHAPE OF THIS FOG.** It used
to be: pitch black, then semi dark, then clear — a board two thirds of which
was a hole with a map somewhere inside it. A player could not plan a defence on
ground they could not see the shape of, so the first minutes of every run were
spent buying the map back rather than deciding anything about it. Every layer
shows the terrain now. The rock, the water, the moss and the spore all read at
every level, and what the layers say is how *current* your knowledge of a place
is — not whether you have any.

The two dark layers are close together on purpose. Both are semi dark; unseen
is the deeper of the two and the gap between them is small. It is enough to
read where you have been and nowhere near enough to make the rest a wall.

## What lights it

Everything that lights the board is something of the player's, and all of it is
still except the last:

- **the core**, twenty-six cells.
- **every turret you own**, out to *its own reach* (the live one — an upgrade
  that lengthens a gun lengthens what it sees), with a floor of nine cells so a
  short-range gun is not blind.
- **a beacon you have bought**, over its whole power disc
  (`BEACON_POWER_R`) — the ground it opens to building is the ground it lights.
- **a beacon you have not**, over the small ring it has always carried
  (`BEACON_VISION_R`). A lamp on a mast lights its own hill whoever owns it, and
  a beacon nobody can find is a beacon nobody can decide to buy.
- **the escort's hauler**, thirteen cells, which is the one light that moves.

Every source falls off over five cells past its reach rather than ending at a
rim, for the reason `BEACON_VISION_R` gives: a hard edge on a soft gradient
reads as a rendering fault.

## What the mission is owed

**A MISSION HAS NO SURPRISES IN IT** (`docs/mission-design.md`), and the fog does
not get to put any back. At the level's birth `Game.seedFog` paints every piece
of a mission's geometry **seen** — not lit, because nothing is watching it, but
never unknown:

- the roads a crosser is sent down and the road the hauler is pushed up, as a
  corridor eight cells wide along the line;
- the circles a siege will rise in, and each emplacement the map places;
- the ground a garrison holds;
- every mark a map stands on the board.

So the question a mission asks — *will you have paid for a position at the
south-west by two minutes* — is a question the player can still answer on the
first frame. A player who cannot see where the south-west IS has not been asked
anything.

## What it costs

The light is kept in two halves because one of them moves and the other does
not. Turrets, the core and the beacons are stamped into a buffer that is rebuilt
only when one of them is built, sold, upgraded, destroyed or switched on — and
then at most once every few frames, so a wave chewing through a big board
coalesces its changes instead of paying for each one. The hauler is laid over
the finished mask afterwards, which is a disc forty cells across and costs
nothing. On an idle frame the whole thing is two hashes and a comparison.

The mask reaches the screen as a cell-per-texel texture under the same linear
filter the hill darkness uses, and only the rectangle that moved is uploaded.
