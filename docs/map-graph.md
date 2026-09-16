# The map graph editor

`/admin/mapgraph`, or the **Map graph →** button on the admin tab bar.

`authoring-maps.md` is the reasoning behind a map and `map-rules.md` is the
checklist. This is the tool: it draws the SPEC a map is generated from.

**It is not a terrain editor and cannot become one.** The generated board
is mostly solid rock; everything playable is open ground carved into it,
and the generator grows that rock out of noise every time, from the seed.
What you place is only where the open ground goes. That is the point — a
shape asked for here comes back as terrain rather than as a drawing.

The map editor on `/admin` is the other tool: it paints a finished
document, and a hand edit there lives exactly until the spec is run again.

## Three things

| | |
| --- | --- |
| **Room** | a clearing carved into the rock. `water` floods it, and a big flooded room is simply sea; `dry` makes it an island, turning water back to ground inside its outline. |
| **Road** | a corridor carved between two rooms, or between a room and the core. `water` cuts a channel instead — deep down the middle, and the land it crosses becomes a ford. |
| **Choke** | pinches whatever corridor runs near that point down to a given width. |

That is the whole vocabulary. **A bend is a road drawn through a small
room** — the generator walks an A* between the ends and brushes a radius
down it that oscillates between the two widths, so a road already narrows,
widens and wanders on its own; a room in the middle is how you say where
it should turn.

The core is not a room, but a road can end on it. (In the emitted spec it
becomes one, appended last, so the generator has an index to name.)

### Water carves rock, and carves it DEEP

A water room does to rock exactly what a dry one does — it cuts straight
through a hill — and fills the hole with DEEP water. So does a water road.
Three things follow, and the first one surprises people:

- **There is no shore on it.** Shallow water is the band between `level`
  and `level - shore` in the water NOISE, so only bias-driven water gets a
  beach. A lake sunk into rock by a room meets that rock hard, with no
  shallow rim at all. Shape a shoreline with a `well` or a `channel` term,
  not with a water room.
- **Deep water is blocked.** Nothing builds on it and nothing walks it —
  it is the naval line's ground and no one else's.
- **A ground road crossing deep water turns it shallow**, which is how a
  ford is made. Cross a water road with a dry one and the crossing is
  walkable.

A deep body thinner than `GAP_WATER` (11 grid cells, so about 3 authored)
is silted shut on the way out, the same way a too-thin gap on land is.

## It says nothing about spawns

The game paints ONE spawn layer with no kinds on it, and a unit picks its
own tiles out of it ([maps.ts](../game/maps.ts)). A graph that named drop
zones would be modelling a distinction the game stopped making, so it
names none: **spawn tiles are painted onto the generated document
afterwards, in the map editor.**

The price is the obvious one. `run()` rewrites the whole document, so
**re-running a spec takes the painted spawn tiles with it.** Generate the
ground until you are happy with it, then paint.

## The loop

1. Load a saved graph from the dropdown, or start on the blank one.
2. Place and drag. **Select** picks whatever is under the cursor — a
   room, a choke, the core, or a road anywhere along its run — and
   **Delete** removes it. Deleting a room renumbers every road that named
   it; deleting a road leaves the rooms alone.
3. **Generate** — the real generator builds, checks and draws it.
4. Read the check lines under the picture. Adjust. Generate again.
5. **Save** writes `scripts/maps/graphs/<id>.json` (the graph, which is
   what the editor reloads), `scripts/maps/<id>.mjs` (the spec), and
   `public/maps/<id>.json` (the map the game loads) when this id already
   is a map. **Publish map** is the first time only: it writes that third
   file for an id that is not a map yet.

   **A failing map is not written and the note says so.** The spec still
   saves — work in progress has to be savable — but the document a player
   loads stays on the last terrain that passed, and the note turns red
   and names the check. A green note means the map moved.

A map is not playable until its id is listed in `OFFICIAL_MAP_IDS`
(`game/maps.ts`) and a world claims it. Saving alone ships nothing.

## The dials that matter

- **Rock threshold reads backwards: HIGHER is MORE OPEN.** It is a cutoff
  the noise has to clear to become rock. 0.515 is Whitepeak's open ice
  shelf at 47% open; 0.38 is Emberdeep's tunnel system at 37%. One number
  does most of the work in making two maps feel unrelated.
- **Water bias terms SUM, and positive is DRIER** — the bias is added to
  the noise and water is what falls below the level. `const` is the sea
  level; `well` is a lake; `ramp` is a sea along one edge drying inland;
  `channel` is a river, optionally leaning (`skew`) or petering out
  (`taperAt`); `spread` dries away from a line.
- **A road meant to READ as a road wants about three times the width of
  the corridors beside it** — 14–18 against 5–7 — on a board under 40%
  open. Above that everything joins up and no single road is legible.

## Reading the checks

The lines under the picture are the generator's own. The ones that bite:

- **open ground between 15% and 50%** — the composition rule.
- **widest way through** — 12 cells on land, 16 at sea. A pinch is named
  with its coordinates.
- **open rim cells** — a room whose outline overhangs the border.
- **orphan open cells** is always 0 and tells you nothing: ground the core
  cannot walk to is FILLED IN rather than reported. So **a room you forgot
  to road simply is not there** in the picture. That is the symptom to
  recognise.

A failing graph still draws. That is deliberate: the picture is how you
find out why, which is also why `run()` writes its preview before it
refuses to write the document.
