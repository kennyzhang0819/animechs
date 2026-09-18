# The economy — scrap, prices and XP

Two currencies that never touch. Code: `game/economy.ts` (income, prices, the XP ladder),
`game/track.ts` (what a level hands over), `game/progress.ts` (the save).
What a run is played under is `docs/difficulty.md` and `docs/mutators.md`.

## Scrap — the run's money

**Every bit of it comes off the CORE, on a clock.** A kill drops nothing, a wave pays nothing
for being survived, nothing is mined, and a sale returns nothing (`SELL_REFUND` = 0). The core
trickles scrap at a rate that reads the **run clock** and nothing else — not the board, not the
swarm, not the rung.

**Why it is decoupled.** Income used to be the swarm's health: a kill dropped scrap off its own
pool and a boss added a lump. That tied two things together that want to move independently.
A wave's size is a difficulty statement, and under a kill economy it was also a paycheck, so
making a stretch of script harder made the run richer — which is most of the way back to
making it easier. It also meant a board that was *losing* got poorer at exactly the moment it
needed to buy its way out, and that the whole late script had to be re-priced every time a unit
tree's health moved. The clock has none of those properties: two runs at minute twelve have
banked the same money, whatever happened on the field, so the difference between them is the
board they built with it. That is the traditional tower-defense shape, and it is the shape the
turret prices below are authored against.

### The curve

```
rate(t) = CORE_INCOME_RATE x 2 ^ (min(t, CORE_INCOME_RAMP) / CORE_INCOME_DOUBLING)
```

| | |
|---|---|
| `CORE_INCOME_RATE` | 330 scrap a second, at t = 0 |
| `CORE_INCOME_DOUBLING` | 255 seconds |
| `CORE_INCOME_RAMP` | 1,125 — the shipped campaign's own length |
| `SCRAP_START` | 6,000 |

**The doubling is the one knob.** 255 seconds against the 22.5-second wave cadence
(`docs/authoring-waves.md`) is about **6% a wave**, so the run's wealth spreads about 20x from
the first wave to the fiftieth. `CORE_INCOME_RATE` moves the whole run's wealth and nothing
else.

| wave | second | rate/s | banked by then |
|---|---|---|---|
| 1 | 3 | 333 | 6,994 |
| 10 | 206 | 577 | 96,835 |
| 20 | 431 | 1,063 | 275,833 |
| 30 | 656 | 1,960 | 605,792 |
| 40 | 881 | 3,614 | 1,214,033 |
| 50 | 1,106 | 6,661 | 2,335,253 |

**It was 130 a second doubling every 190s, and that starved the opening.** A 190-second
doubling puts 98% of a run's money after wave twenty; playtested, the first three minutes could
not reach tier 2 at all. A curve that steep only pays the player who already survived it, which
is the opposite of what a defence economy is for. The fix was half here and half in the prices
below — see the tier-2 note.

**The rate and the doubling move together, and that is how the opening gets paid.** 240 a
second over 230s still read as tight through the first ten waves in play, which is the same
complaint as the 190s curve in a milder form. Raising the rate alone inflates the whole run;
lengthening the doubling alone makes the late game poorer against a tide that keeps doubling.
Moving both — 330 a second over 255s — lifts the first ten waves by about a third and leaves
the rate past wave forty where it was, so the generosity lands where the board has no coverage
yet and nowhere else. The opening bank went 4,000 to 6,000 in the same pass: it is the only
number that is purely the opening, and it buys five tier-1 cards instead of three.

**It stops climbing at the ramp.** Past `CORE_INCOME_RAMP` the rate is flat while the tide
keeps doubling the swarm's health every cycle (`docs/mission-design.md`), so no map can be
banked out of — the same rule the tide already enforces on the board, stated once more in the
purse.

**Every rung pays the same.** Income reads the clock, so Incursion and Nemesis +5 hand over
identical money at identical seconds. A harder rung is harder, not poorer.

`RICH_SCRAP` is the admin view's bottomless purse — large enough that no price check comes up
short, small enough to render on the HUD; the income is skipped entirely while it is on.

The kill-drop table (`dropForUnit`, `SCRAP_PER_HP`, `payableHp`, `BOSS_SCRAP`) is **still
here and nothing in a run reads it**: the level editor and `ladder.ts` still weigh a script by
what it would have paid, which is a useful number about a script even though it is no longer a
number about a purse.

## What a run spends on

**Turret cards, and nothing else.** Mods and relics are off the track and off the corner
(`track.ts`; the catalogs in `mods.ts` and `relics.ts` are intact and nothing deals from them).

### The tier is the footprint

`TOWER_TIER` files every turret by its size in tiles, so tier 1 is the 1x1s, tier 2 the 2x2s,
tier 3 the 3x3s and tier 4 the three 4x4s — checked at import. The corner's **1 / 2 / 3 / 4**
keys name the tier and the deal rolls uniformly inside it (`rarity.ts rollTurretOfTier`), so
the number on the button says how much ground the card will want before the roll happens. The
four rarities ARE the four tiers, which is where the card's border colour comes from.

| tier | per turret | 3x3 (9) | 5x5 (25) | 7x7 (49) | ground at 3x3 | at 7x7 |
|---|---|---|---|---|---|---|
| 1 | 120 | 1,080 | 3,000 | 5,880 | 3x3 tiles | 7x7 |
| 2 | 700 | 6,300 | 17,500 | 34,300 | 6x6 | 14x14 |
| 3 | 4,000 | 36,000 | 100,000 | 196,000 | 9x9 | 21x21 |
| 4 | 32,000 | 288,000 | 800,000 | 1,568,000 | 12x12 | 28x28 |

**The gaps are about six times a step through the middle and eight into tier 4**, 267x end to
end, which is far steeper than the per-kind prices this replaced (110 to 9,500 was 86x). Per
TILE it is 120 / 175 / 444 / 2,000 — a 16.7x spread. The steepening is at the top, where it
buys something: a gap at the bottom gates nothing except whether the run gets started, so the
thing worth gating is the 4x4. A tier-4 gun is expensive because it is sixteen tiles of gun,
and then expensive again on top of that because reach and splash are worth more than raw
damage.

**The price is the tier's, flat, for every gun in it.** It has to be: the gun is rolled and the
price is printed on the button before the press. `TOWER_PRICE` is derived from the tier and the
admin dashboard can still bend one kind (`setScrapPrice`).

**What the numbers buy**, measured as SECONDS OF INCOME at the rate in force — which is the
number that decides whether a band is reachable, not the raw price. A tier-2 block is well
under a wave's income from wave one (19s at wave 1, 12s at wave 8). A tier-3 block is about
1.5 waves at wave 20, a real save-up. A tier-4 block is about 3.5 waves at wave 40, a genuine commitment.
Saving every coin, the earliest a bank covers a 3x3 is wave 1 / wave 1 / wave 5 / **wave 21**,
and a run actually holding a line reaches those much later. A whole run banks about 2.34M.

### The shape

`FORMATION_IDS` is three solid odd squares — **3x3, 5x5, 7x7** — cycled with **X** as a
standing setting. It multiplies all four prices by its cell count, flat, **with no bulk
discount**: what it buys is ground, and a 7x7 of tier 4 is a 28x28 patch of map and most of a
run's bank.

They are ODD squares so the shape has a middle and the ghost sits centred on the cursor. The
floor is nine turrets and there is nothing smaller: a card is never "a tacker", it is "nine
tackers in a block", and the question it asks is where nine of anything can go.

**Neither half of a card is a roll any more.** The tier is chosen and the shape is chosen; the
only thing the deal turns over is which gun of the band came up, and every gun of a band is the
same footprint and the same money. A press is a decision about ground and about how much of the
bank to commit, and never a slot machine with a price on it.

### Nothing is paid until the ground takes it

**Drawing a card is free, and so is re-drawing.** The purse moves in `Game.placeFormation` and
nowhere else, so 1, 2, 3, 4 is a way of *asking* what each tier would put down here — the ghost
answers on the terrain under the cursor, which is the only place the question can honestly be
answered. Charging at the press made looking cost money, and a player who cannot afford to look
ends up buying the tier they already know.

The bank is still checked at the draw: a card that cannot be paid for is a ghost that cannot be
placed, and a hand holding one would be a lie the player only finds out about on the click.

**A card is charged in full the moment any of it lands.** Ground that takes none of the shape
keeps the card in hand to try somewhere else; ground that takes part of it spends the card on
the part, which is the player's call and the ghost showed them exactly which cells they were
making it about.

`STAGES` cuts the run at waves 1-14 / 15-28 / 29-40 / 41-50, one per tier.
`ladder.ts stageAudit` and `STAGE_BOARDS` are the table the prices are authored against and the
one to read after touching either side.

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

## The level climb — flat, 500,000 a level

`XP_PER_LEVEL` is 500,000 and it is **the whole curve**: level 1 to 2 costs it, level 812 to 813
costs it, and nothing in between is a lookup. A Nemesis clear pays 100,000, so **a level is five
clears, everywhere**. That is the number a player can hold in their head, which is the entire
argument for a flat ladder.

- **Levels 1 to `SKILL_POINT_LEVELS`** (100) each pay **one skill point** — a save that reaches
  100 has 100 to spend across the 210 nodes of the skill tree (`docs/skills.md`). This is the
  climb that is actually *for* something.
- **Levels 100 to `LEVEL_CAP`** cost exactly the same and hand over nothing. The number still
  moves, and that is all it does.

**It was StarCraft II's mastery table, transcribed and scaled by 1.5**, and it was dropped rather
than retuned. Its shape was 5,000 for the first level and 1,552,500 for the ninetieth — a grind
whose *rate* changed under the player as they climbed, so "how far is the next point" had a
different answer at 20 than at 80 and the only way to know was to look it up. A ladder is a farm,
a farm has to have a **known** rate, and the only honest shape for one is a line.

**Reaching 100 is 500 Nemesis clears** — close to what the scaled SC2 table cost (484), so the
total grind is where it was; what changed is that it is now evenly spread rather than free at the
bottom and brutal at the top. The early levels are the ones that got dearer, and they are also the
ones that hand over the roster, which is the right way round: the toolkit should cost something.
