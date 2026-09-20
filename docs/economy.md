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
| 1 | 3 | 333 | 7,000 |
| 10 | 206 | 578 | 97,000 |
| 20 | 431 | 1,065 | 279,000 |
| 30 | 656 | 1,962 | 614,000 |
| 40 | 881 | 3,617 | 1,224,000 |
| 50 | 1,106 | 6,665 | 2,329,000 |

**It was 130 a second doubling every 190s, and that starved the opening.** A 190-second
doubling puts 98% of a run's money after wave twenty; playtested, the first three minutes could
not reach tier 2 at all. A curve that steep only pays the player who already survived it, which
is the opposite of what a defence economy is for. The fix was half here and half in the prices
below — see the tier-2 note.

**The rate and the doubling move together, and that is how the opening gets paid.** 240 a
second over 230s still read as tight through the first ten waves in play, which is the same
complaint as the 190s curve in a milder form. Raising the rate alone inflates the whole run;
lengthening the doubling alone makes the late game poorer against a tide that keeps doubling.
Moving both — 330 a second over 255s — lifted the first ten waves by about a third and leaves
the rate past wave forty where it was, so the generosity lands where the board has no coverage
yet and nowhere else. The opening bank went 4,000 to 6,000 in the same pass: it is the only
number that is purely the opening, and it buys three tier-1 presses.

**It was 600 for a while** — a flat 1.8x — while the shape of a card was a thing the player
CHOSE and a press bought exactly the ground it was told to. The shape is a roll again, so the
press is cheaper per turret on a good draw and dearer on a bad one, and the run does not need
the extra money to cover the difference.

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

| tier | per turret | a press | x4 | x16 | ground at 3x3 | at 6x6 |
|---|---|---|---|---|---|---|
| 1 | 120 | 1,920 | 7,680 | 30,720 | 3x3 tiles | 6x6 |
| 2 | 700 | 11,200 | 44,800 | 179,200 | 6x6 | 12x12 |
| 3 | 4,000 | 64,000 | 256,000 | 1,024,000 | 9x9 | 18x18 |
| 4 | 24,000 | 384,000 | 1,536,000 | 6,144,000 | 12x12 | 24x24 |

**One step, about six times, all the way up** — 5.8x, 5.7x, 6.0x — **200x end to end**, which is
still far steeper than the per-kind prices this replaced (110 to 9,500 was 86x). Per TILE it is
120 / 175 / 444 / 1,500, a 12.5x spread: a tier-4 gun is dearer per tile as well as bigger,
because reach and splash are worth more than raw damage.

**Tier 4 used to steepen to eight**, on the argument that the 4x4 is the thing worth gating and
a gap at the bottom gates nothing except whether the run gets started. The gate is the run
clock now (`TIER_UNLOCK`), and a band already shut until fifteen minutes does not need to be
the dearest step on the ladder as well. At 512,000 a press a run could afford two before the
script ended, which made tier 4 a thing you bought once rather than a thing you built with.

**The price is the tier's, flat, for every gun in it and whatever shape rolls.** It has to be:
the gun and the shape are both rolled, and the price is printed on the button before the press.
`TOWER_PRICE` is derived from the tier and the admin dashboard can still bend one kind
(`setScrapPrice`).

**`CARD_CELLS` is 16 and it is a price, not a size.** A press is `TIER_PRICE x CARD_CELLS x
amount`, and the shape that actually lands is 9, 16, 25 or 36 turrets. Sixteen is the mean
shape under the shipped odds (40/30/20/10 over those four averages 17), rounded down to a
square so "the price of a 4x4" is a thing a player can hold in their head. Draw badly and you
paid over the odds; draw well and you got a 6x6 for the price of a 4x4.

**What the numbers buy**, measured as SECONDS OF INCOME at the rate in force *when the band
opens*. Tier 1 is six seconds from the first frame; tier 2 about fifteen at 5:00; tier 3 about
forty at 10:00; tier 4 about a hundred at 15:00. Counted as presses the bank can already cover
on the minute the band opens, that is 3 / 14 / 7 / 3. A whole run banks about 2.33M.

### The shape is the roll

`FORMATION_IDS` is four solid squares — **3x3, 4x4, 5x5, 6x6** — and the deal rolls one on
every press (`rollFormation`). The bands are the turrets' own four, off the square's side, so a
3x3 is common and a 6x6 ultra; the odds are **40 / 30 / 20 / 10**, deliberately softer than the
turret roll's, because what a player should feel at the button is "which gun" first and "how
much of it" second.

The floor is nine turrets and there is nothing smaller: a card is never "a tacker", it is "nine
tackers in a block", and the question it asks is where nine of anything can go.

**X is the AMOUNT, not the shape.** It cycles **1 / 4 / 9 / 16** as a standing setting and
multiplies all four prices flat, **with no bulk discount**. What it buys is the rolled shape
TILED that many times (`fleetLayout`) — one gun, one roll, that much more ground — and every
amount is a square so the copies butt with no gap. A x16 at tier 4 is 6.1M, which no
run banks; the top of the ladder is a ceiling rather than an offer.

### The bands open on the clock

`TIER_UNLOCK` shuts a band until the run clock reaches it: tier 1 from the first frame, then
**5:00, 10:00 and 15:00**. A shut button wears a grey sweep that retreats clockwise as its
minute comes round, and **no number**: the shade says "not yet" and roughly how far off, which
is what a player glances at mid-wave. A countdown would be a clock to watch.

**It is the clock and not the bank**, which is the point. Income is a function of time alone,
so a bank gate would be a clock gate in disguise — and a player who saved would meet the same
wall as one who spent, later and with nothing to show for the wait.

15:00 is wave forty of fifty (`docs/authoring-waves.md`), which is where `STAGES` puts tier 4
anyway: the gate is the stage table said in seconds rather than a new rule on top of it.

### The press pays

**The whole price leaves the purse at the draw** (`Game.buyTurretCard`), before the ghost is on
the board and whatever the ground turns out to say about it. A card is a thing you have *bought*,
and where to put it is the only question left.

**So a second press throws the first card away and the money with it.** Drawing was free for a
while, and re-drawing with it, which made 1, 2, 3, 4 a way of asking what each tier would put
down here at no cost — that is a browse, not a purchase, and it took the decision out of the
press. The price is on the button before it is pressed, so the only surprise a draw can hold is
what it hands over — never what it cost.

**Placing costs nothing**, because the card is already owned. Ground that takes none of the shape
keeps the card in hand to try somewhere else; ground that takes part of it spends the card on the
part, which is the player's call and the ghost showed them exactly which cells they were making
it about. The right button puts the *ghost* away and leaves the card in its slot — that gesture
has never spent anything and still does not.

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

## The level climb — a ramp to 500,000

`XP_PER_LEVEL` (500,000) is **the top of the curve, not the whole of it**: it is what the
hundredth level costs and what every level past it costs. Below that the climb ramps, from
**2,500** for level 1 to 2 up to the full 500,000 for 100 to 101.

The shape is **StarCraft II's mastery table** — ninety steps, resampled over a hundred and
multiplied until the last of them is `XP_PER_LEVEL`, rounded to the nearest five hundred. That
curve is the reference this game's progression is cut from, and the table is kept verbatim in
`economy.ts` so the derivation can be read rather than trusted.

| level | that level costs | total banked |
| --- | --- | --- |
| 1 → 2 | 2,500 | 0 |
| 10 → 11 | 11,500 | 85,000 |
| 25 → 26 | 25,500 | 332,000 |
| 50 → 51 | 69,000 | 1,500,000 |
| 75 → 76 | 134,500 | 3,915,000 |
| 100 → 101 | 500,000 | 9,400,000 |
| 400 → 401 | 500,000 | — |

A Nemesis clear pays 100,000, so **level 101 is ninety-nine clears** and the first twenty levels
are two and a half. That front-loading is the point: a new save is levelling while it is still
learning the board, and the grind arrives only once there is something to grind for.

- **Levels 1 to `SKILL_POINT_LEVELS`** (100) each pay **one skill point** — a save that reaches
  100 has 100 to spend over the 200 ranks of the skill tree (`docs/skills.md`). This is the climb
  that is actually *for* something, and it is also exactly the ramp.
- **Levels 100 to `LEVEL_CAP`** cost `XP_PER_LEVEL` each and hand over nothing. The number still
  moves, and that is all it does.

**A flat climb was tried and it was wrong at both ends.** Every level at 500,000 meant the first
level cost five clears — a save that has seen one map paying the hundredth level's price — and it
meant the curve said nothing about where a player stood. The argument for it was that a known rate
is easier to hold in your head; the answer is that the rate is still one sentence ("it ramps to
five clears a level at 100"), and that a ladder nobody can get onto is not a ladder.
