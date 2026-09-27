# The sprite sheet

Every picture the renderer draws comes off one 4096-square texture packed
in `game/atlas.ts`. The sheet is **a cache, not a catalog**: the catalog of
art lives in code and can grow without limit, and the sheet holds the
working set of the level being played. What has to fit is one level, not
everything the game owns.

## Cells and handles

A cell is declared once, at import, by size: `reserve(name, w, h)` and the
shapes over it (`tile`, `sprite`, `flat`, `top`, `upright`, `column`). It
hands back a UV rect that is a **handle**. The rect's numbers are written
when a sheet places the cell and are rewritten by every pack, so a
consumer reads them at draw time and never bakes them into a constant. The
one rect cut out of another (the large walls' quadrants) is registered
with `derive` and refreshed with its parent. A cell not on the current
sheet reads as the sheet's corner, a transparent gutter texel, so a stray
draw of it shows nothing.

## What a sheet holds

- **The shared roster**, on every sheet: floors, walls, the fixed prop
  kinds, rails, towers, shots, the HUD's odd shapes, and every unit of no
  line — the Sovereign, the crosser, the railgun, the Pylons, the Wardens,
  the Fabricators, the Brander, the escort's cart. A mission or a mark can
  put those down on any map, so they are never left out.
- **The unit lines the run sends**: the eleven lines (`UNIT_LINES`) are
  the ones a sheet may hold or leave out. A level asks for its families'
  trees (`game.ts runUnits`, off `LevelSpec.families`), which is four
  (`FAMILIES_PER_RUN`), and custom mode may name no more
  (`FAMILIES_MAX`). Which cells are a line's is not declared: it is read
  off the renderer's own tables (`UNIT_ART`, `MECH_ART`, `LEG_ART`,
  `FLYER_PARTS`, `SEGMENT_ART`) the first time a sheet is packed
  (`deriveUnits`), so a cell two lines share is resident with either and
  a cell a line-less kind reaches is shared. A body's team cell, cut to
  its art at pack time, is its line's too.
- **The biomes' family slots** (`FAMILY_SETS`, `props.md`): three sets of
  cells the board's biomes are painted into by `ensureFamilies` when the
  terrain is built, on top of the packed sheet.

## Packing

`buildAtlas({ units })` is the whole API. A live sheet that already holds
every line asked for is handed back as it is; otherwise a fresh sheet is
packed — every wanted cell placed biggest-first, which is the order
MaxRects packs tightest, then painted. **What the last sheet had painted
is copied across** rather than drawn again, so a run that keeps the same
lines repacks in the time of a few blits, and one that swaps a line
paints only that line and its team cells. `keep: true` adds lines to the
sheet in play without moving anything on it: that is what the renderer
asks for when a body of a line the sheet does not hold turns up
(`Renderer.fetchLine`), and the texture is sent again once it lands. If
the line does not fit, the body draws nothing and a warning says so.

Builds queue, so two callers never pack at once; `atlasReady(units)` says
whether the sheet in hand already holds a set, which is what the loading
bar reads.

## Pictures off the sheet

`unitIcon`, `unitQuad` and `cellIcon` carve a picture off a sheet for the
HUD, the codex, the deploy screen and the editors. A kind the live sheet
holds is carved from it. A kind it does not is painted, with the rest of
its line and nothing else, on a **scratch sheet** of 2048 (`sheetFor`),
and carved from that; two scratch sheets are kept at a time, and the urls
are cached upstream (`components/unitIcons.ts`) for the life of the page.
So the codex shows every family whichever four are in play, and no line
has to be on the live sheet to have a picture.

## The check

`npm run check` has no canvas, so its atlas stage places without
painting: `planAtlas(lines, teamCells)` packs the shared roster, a hand of
lines and the team cells the art stage measured, and reports the fullest
of the four-line hands drawn from the seven heaviest lines
(`atlasWeights`). Over 85% is a warning; a hand that does not pack fails
the gate. The art itself is exercised only in a browser: the render clock
of `npm run check:full`, or a run.
