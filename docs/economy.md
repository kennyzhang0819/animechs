# The economy — scrap, prices and XP

Two currencies that never touch. Code: `game/economy.ts` (drops, prices, the XP ladder),
`game/track.ts` (what a level hands over), `game/progress.ts` (the save).
What a run is played under is `docs/difficulty.md` and `docs/mutators.md`.

## Scrap — the run's money

**Every bit of it comes off the swarm.** A kill drops scrap off its own health pool; a boss
adds a lump. That is the whole income: the core pays nothing, nothing is mined, no wave pays
for being survived, and a sale returns nothing (`SELL_REFUND` = 0). Drops are fixed per
**kind** — an ironhide1 always pays this, on every tier, on every map — so the roll fee can be
authored against the script.

**There is no wave bonus.** Staging a wave used to pay a lump on top of what its bodies
dropped — 250, and 50 more each wave — and it was passive income: a board that killed nothing
banked it anyway, just for surviving the gap. The bank moves when bodies fall and at no other
time, which is the only version of this economy a player can reason about.

### What a kill pays

`SCRAP_PER_HP` = 1/15, anchored on the ironhide1: 150 health at a fifteenth is the ten scrap
it has always paid. The drop used to be one number per unit tier — ten for a T1, five hundred
for a T5 — and a tier is far too coarse a bucket: an ironhide4 carries sixty runts' health and
paid twenty runts' scrap, so the late script was the part of the run that paid worst for the
work it asked. Reading the kind's own health fixes that for every kind at once — a stats edit
moves the drop with it, and a new kind is priced the moment its health is written.

It reads the **authored** health, never the level-scaled pool: a full clear has to pay the
same scrap on every difficulty tier, or the turret prices would mean a different thing on each.

**The rate bends at the heavy end** (`payableHp`), because a health pool is what a body is
worth to *kill* and not what it should be worth to *bank*. The unit trees do not climb
smoothly — a T3 hull is nine hundred health and the T4 above it is nine thousand — so the step
from the middle of the script to the end multiplied income by ten in one shelf. An ironhide5
paid 1,600, a card and a half for one body, and a late wave is hundreds of bodies: by wave 40
the bank stopped being a constraint at all.

So health under `DROP_KNEE_HP` (600) pays the full rate and health above it pays a shrinking
one (`DROP_HEAVY_EXP` 0.7). A heavier kind is still strictly worth more than a lighter one —
that is the whole reason the drop reads health — but the curve is flatter than the health
curve. The knee at 600 is the top of the T2 shelf, which makes this a late-game edit and not a
balance sweep: every T1 and T2 body pays exactly what it always paid, a T3 gives up roughly a
tenth, and the cut lands where the complaint was — about 55% off a T4 and 65% off a T5.

`BOSS_SCRAP` (5,000) is on top: a boss is an event as well as a body.

`SCRAP_START` is 10,000. `RICH_SCRAP` is the admin view's bottomless purse — large enough that
no price or bulk-buy check comes up short, small enough to render on the HUD; the spending
itself is a no-op.

## What a run spends on

A turret is **not bought at its own price**. The player pays one roll fee, the deal rolls a
rarity and a formation and hands over a card, and the card is placed for nothing. So
`TOWER_PRICE` stopped being what a board spends and became what a draw is *worth*: the number
the odds are composed against, and nothing a player ever pays.

| | price | |
|---|---|---|
| `TURRET_ROLL_PRICE` | 1,000 | flat, on every pool and at every level |
| `MOD_ROLL_PRICE` | 5,000 | a chance riding every turret placed from now on |
| `RELIC_ROLL_PRICE` | 150,000 | a rule over the whole board, in force the moment it is paid for |

**The roll fee is flat.** It was briefly derived from what the save's pool was worth, and that
stopped being worth the cleverness the moment a card started carrying a **formation**: a draw
is four to thirty-six turrets now, so what it is worth swings by more with one roll than the
pool's depth ever moved it.

**Both modules are dearer than a turret card**, because the two things are not the same
purchase: a turret card is *spent* — placed, shot at, one day gone — and a module is *owned*
for the rest of the run.

**And a relic is dearer than a mod.** A mod is a **chance** — it improves nothing standing and
adds a roll to every turret placed from here on, so what it is worth depends on how much board
the run has left to buy. A relic is **in force the moment it is paid for**, over every turret
already up and every one still to come, and it never stops. The third button buys certainty
and the second buys odds, and the prices have to say so. They are also the two eras they were
written for: a mod is what a run spends on in the middle, a relic what a late game saves for.

**The mod price was 2,000 and every step in the catalog went up by the same 2.5×**, so the same
bank buys the same total; what it buys is *fewer presses of a bigger thing*. Two thousand made
the button a thing a comfortable run tapped twenty times between waves for twenty tweaks too
small to feel — a click count standing in for a decision. At five thousand a press is an event,
and it comes with a choice of three.

**150,000 for a relic is not a typo.** It was 3,500, which is where a "+10% damage" belongs, and
every relic has since been rewritten to change the game rather than nudge it. Thirty thousand
was still too cheap, and what proved it was how early the button stopped being a decision:
thirty turret cards is a bank a run rebuilds inside a couple of waves once a line is holding, so
relics arrived in a block in the mid-game. At a hundred and fifty thousand — the opening bank
twenty times over — a relic is a whole act of a run saved for, and buying one is giving up the
board that money would have been. (Note the track does not deal relics at present; the price is
waiting for its door.)

### Offers and amounts

`TURRET_CHOICES` and `MOD_CHOICES` are both 3. **Three is the smallest number that is a
choice**: two is a coin flip with the sides named, four is a reading exercise mid-wave, and
three fits in one glance at the width the corner already is. The press pays for **one** and
rolls three to ask which — it is not a discount; what the three buy is the right to take the
best of three rolls.

The two are separate constants because they are separate experiments. The mod panel is settled;
the turret one is not, and `TURRET_CHOICES = 1` is the switch that returns the T button to one
roll straight into the hand, with nothing else to touch. A trial that cannot be undone in one
line is a trial nobody runs twice.

`BUY_AMOUNTS` = 1, 4, 9, 16. **They are squares**, and that is the point of these four and not
some other four: on the turret button the amount *tiles* the shape, so a square amount tiles
into a square and a fleet comes out with the proportions of the card that bought it. They were
5 and 10, and an oblong number has to be laid out as something nobody designed. Checked at
import.

**Flat multiplier, no bulk discount anywhere** — ×16 turrets costs exactly sixteen roll fees.
The button saves keystrokes and nothing else; a discount would make the single press strictly
wrong, and the single press is the whole T-click-T-click flow the deal was built around. What
the multiplier buys differs by side: on the turret button it is **one** card carrying the shape
tiled N times; on the module buttons it is **N independent draws**, because there is no ground
to tile.

## Turret price bands

Three bands along Mindustry's build-cost order (`TOWER_TIER`), priced so that the stage that
meets them is roughly what buys them. **A pricing table and nothing else** — no band is held
shut inside a run.

The support pair sits a band below what it keeps alive: a fixer is an opening purchase, and the
projector goes down beside the first band-2 gun it is there to nurse.

`STAGES` cuts the run at waves 1–20 / 21–35 / 36–50, one per band. `ladder.ts stageAudit` is the
table the prices are authored against and the one to read after touching either side.

Prices are bendable without a rebuild (`scrapPriceOf`, `setScrapPrice`); the authored
`TOWER_PRICE` is where a Reset returns to. `pricePerTile` is the number to compare two turrets
by.

## XP — the save's progress

**Paid for objectives, never for kills.**

`MISSION_XP` (100,000) is what a clear at Nemesis is worth — the mission met, whichever mission
the map carries. Tiers below pay a share of it and tiers above a bonus (`tierXpBonus`).

**A defeat is paid out of the same pot**, one wave at a time as the waves are broken. That is
the consolation ledger and not the objective: the waves stopped being what a map is finished by,
and a run that met its mission at wave twelve banks the whole pot with thirty-eight waves still
on the board.

`WAVE_XP_RAMP` = 3: the last wave pays three times the first, shares ramping linearly. A tide
run's wave count is bigger than the document's, so `missionXp` takes the count it actually sent.

**A random map pays nothing extra.** `RANDOM_MAP_XP_BONUS` (a quarter) is gone — it was a bribe
to leave the macro alone, and a bribe is the wrong tool: Random is the default and the best way
to play, and a run that pays a quarter more for it makes every deliberate map choice feel like a
tax on knowing what you want. The only thing that moves what a run pays is the difficulty it is
played at.

## The level climb — SC2's mastery ladder, cut by a third

`SC2_MASTERY` is Blizzard's own table, transcribed, and `SC2_SCALE` (1.5) is the only thing done
to it. **This is the one knob** — every number on the ladder is SC2's times this, so moving it
moves the whole grind and nothing else, and the table is all multiples of 500 so any sane factor
lands on whole XP. The shape is checked at import because it was transcribed by hand.

- **The mastery ladder**, levels 1 to `ASCENSION_FROM` — 90 of them, their mastery 0 being our
  level 1. Theirs pays a mastery point a level; ours pays one too, and **there is nothing to
  spend it on yet**. The points bank against a system that is not written, which is fine: the
  ladder already pays in the track, which deals the whole toolkit over the first 15 levels and
  then a rule a level to the cap.
- **The ascension wall**, `ASCENSION_FROM` to `LEVEL_CAP`: `XP_LEVEL_FLAT` a level, forever.
  Nothing is handed over up here in their game or ours. A farm has to have a **known** rate, and
  a wall is the only honest shape for one — a cost that kept climbing past the last reward is a
  curve quietly leaving the player behind.

**Their commander levels are deliberately not here.** SC2 runs 15 commander levels *before*
mastery opens, and those are the reason its mastery table is allowed to start at 5,000 — a player
reaching mastery 0 has already paid 1,045,000 for the privilege. Dropping that phase is what
makes this ladder cheap early **on purpose**: the toolkit is handed over inside the first five
clears, and the long climb is the rules and the points, not the guns.

**The scale makes it easier than theirs, twice over.** A Brutal clear pays them 44,000; a Nemesis
clear pays us 100,000, which is 2.27× that — so their numbers left alone would already cost us
56% fewer clears than a co-op player. Scaling by 1.5 hands a third of that discount back and keeps
the rest: about **a third fewer clears** than SC2 for the same rank. Their mastery 90 is 420
Brutal clears and ours is 277; their ascension level is 4.55 clears and ours is 3.
