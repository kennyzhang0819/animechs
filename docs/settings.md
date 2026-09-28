# Settings

The Settings screen is one panel, raised from the title card and from the
pause sheet (`settingsBody` in `components/Animechs.tsx`). Six tabs: Game,
Video, Audio, Interface, Controls, Info.

## What each tab holds

| tab | rows |
|---|---|
| Game | Pause when unfocused · Restore default settings · Reset save (menu only) |
| Video | Display mode · Monitor · Window size (desktop shell only) · Render scale · FPS limit · Brightness · Effects · FPS counter |
| Audio | Master, music, effects and interface volume · Mute when unfocused |
| Interface | UI size · cursor size, fill, border · ally, enemy and prop health bars · status icons |
| Controls | Pan speed · Zoom speed · Reverse mouse zoom · the key reference |
| Info | version, author |

Every row applies the moment it is touched, mid-run included. There is no
Apply button and nothing needs a restart.

## Where a setting lives

Every preference is a field on `Progress` (`game/progress.ts`), in the one
save slot (`game/storage.ts`: a file under the desktop shell, localStorage in
a bare tab). It goes to Steam Cloud with the campaign. The three window rows
are the exception: the shell owns them in `window.json` because it needs them
before the page boots (`docs/desktop.md`).

`Restore default settings` strips the keys in `SETTING_KEYS` and nothing
else; the campaign, the run pick and the skills stay. `Reset save` wipes the
slot, settings included.

## How a row reaches the game

A knob is state in `Animechs.tsx`, written to the save on every press
(`saveSetting(key, value)` for the newer rows, a `saveX` function for the
older ones) and, where a run cares, pushed into it (`gameRef.current?.setX`).
`applySettings(p)` is the one place a save's preferences become state and
reach a running game: at boot, after a restore, after a wipe. A run that is
just starting reads them off the save itself, in the `Game.create` callback.

Adding a row means: a field and a reader in `loadProgress` (a stored value the
game no longer offers must read as absent, so a slider never lands off its
stops), a default, a key in `SETTING_KEYS`, state in the shell, a line in
`applySettings` and in the `Game.create` callback, and the row.

## The Video rows that are not the window

- **Render scale** multiplies the device pixel ratio the two field canvases
  are allocated at (`Game.resize`). Below one it is the frame-time knob for a
  weak GPU; above one is not offered, the field is pixel art.
- **FPS limit** is a gate at the top of `Game.frame`: a frame due sooner than
  the cap's period is skipped whole, sim step included, and the sim hears the
  full gap on the frame that draws. `requestAnimationFrame` is already
  vsync-locked, so Unlimited is the display's own rate and there is no
  vsync switch.
- **Brightness** is a CSS `brightness()` filter on each field canvas, never on
  a wrapper: a filter makes its element the containing block for the
  fixed-position corner chrome inside it. The HUD is not affected.
- **Effects** and the **FPS counter** are older rows: `Sim.setEffects` and
  `UiState.fps`.

## Pause when unfocused

On `blur`, and on the document going hidden, the game opens the pause sheet
(`Game.onBlur`) when the row is on. A sim on a hidden tab is held anyway,
because `requestAnimationFrame` stops, but the sheet makes the hold visible and
survives the window coming back. Off is for a second-monitor player who wants
the run to keep going while they read something else.

## Audio

Nothing in the game plays a sound yet. The tab stores `Progress.audio`
(`AudioSettings`: four volumes in twentieths and a background mute) so that
the sound, when it arrives, reads a preference the player has already set.
Read it through `loadProgress().audio ?? AUDIO_DEFAULT`. Do not add rows for
outputs or devices until there is an engine to list them from.
