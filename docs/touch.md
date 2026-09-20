# Playing with a finger

The game is built for a mouse and a keyboard. This is what a tablet gets instead, and it is
deliberately small: most of the HUD was already buttons, so only the things that lived on a
key or on a mouse button a tablet has not got needed anything new.

## The gestures

| | |
|---|---|
| one finger, card in hand | the ghost tracks the finger; the card lands on the **lift** |
| one finger, empty hand | tap selects, drag is a marquee — unchanged, both already decided on release |
| one finger, SELL lit | demolish under the finger, and the drag chains along, exactly as the right button does |
| two fingers | pan and zoom, together |

**The card lands on the LIFT and that is not a detail.** Two fingers never touch the glass on
the same millisecond, so the first finger of a pan arrives as an ordinary one-finger press. If
that press placed a card the way a mouse click does, every attempt to pan would spend one.
So a touch press with a card in hand only *aims*: `tapPlace` in `game.ts`, committed in
`touchUp` and thrown away the moment a second finger arrives.

**Pan and zoom are one gesture**, because two fingers on glass are always doing some of both.
The world point under the old centroid is pinned to the new one — the same arithmetic the
wheel uses to hold the point under the cursor still — so sliding pans, spreading zooms, and
doing both does both.

**`touch-none` on the canvases is load-bearing.** Without it Safari keeps the pan and the
pinch for the page and the board never sees a gesture at all.

## The three buttons

`components/TouchControls.tsx`, bottom left, and only where the pointer is **coarse** — a
desktop run is exactly what it was. Pause (was space), turn (was R) and the demolish tool
(was the right button, which a tablet has not got). Everything else a finger needs was
already a button: the tier square, the amount, the card, and the menu in the top corner.

The coarse-pointer test runs after mount, not during render: the bundle is prerendered
(`output: export`) and the server has no pointer to ask about, so deciding during render is a
hydration mismatch.

## What is still keyboard-only

`T` (re-roll) has no button, because tapping the tier button already re-rolls — it overwrites
whatever is in hand. The building grid on a free board keeps its letter shortcuts, and the
sandbox door is still `Ctrl+Shift+S`. Neither matters to a campaign run.

The **ruler** (shift + drag) has no touch gesture. It needs a modifier and there is nowhere
to put one; a tablet builds a line by placing twice.
