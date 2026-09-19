# Mutators

The rules a run is played **under**, rolled for it rather than chosen. Code:
`game/mutation.ts` (catalog, costs, roll, per-rule constants), `game/ladder.ts`
(which tier rolls how much), `game/sim.ts` (every rule's actual behaviour).

## The model

StarCraft II co-op's. Each mutator carries a **point cost** saying how much harder it
makes the run; a difficulty tier carries a **budget** and a **count**; deploying rolls
that many rules to fit inside that budget (`rollMutations`). In regular mode the player
never picks and never sees the roll coming — that is the appeal of the mode, and why
the choosing is not in `mutation.ts` at all. Custom mode is the one exception: a hand
named in `MutatorPicker` replaces the roll outright, costed against the same budget.

**Why it is mandatory and unchosen.** Mutation used to be a tech-tree column — a rank
per boss felled, a switch the player could flip for a harder game. Nobody flips those
switches: an optional handicap with no reward attached is one nobody takes, and it still
had to be balanced as though everyone did.

**The gate is the ladder, not the map.** A run is played under the points and count its
tier carries; the four named difficulties carry zero of each. The roll used to be a
per-world switch (`LevelSpec.mutators`), which was one gate too many — the first world
could never be made harder and every world after it could never be played straight.

**A level may still carry rules of its own.** `LevelSpec.intrinsicMutation` is a list a
world is *always* played under, at every tier. Never rolled, never charged against the
budget. "This map is the shielded one" is authorship; "this map is allowed to mutate at
whatever strength the difficulty says" put a level in charge of a difficulty curve.

**A mutator changes a wave after it spawns, never what the script sends.** Hard rule,
and it is what keeps `ladder.ts` honest: wave counts, enemy totals and the drop-ratio
audit stay true whatever the roll came back with. A rule that wants to change the script
is an edit to the map's script, not a mutator.

## The cost scale

```
1-2  LIGHT   noticed every wave, decides no run on its own
3-4  HEAVY   changes how the map has to be held
5-6  BRUTAL  invalidates a way of playing outright
```

Nothing may cost more than `MUT_COST_MAX` (6). A rule worth more than that cannot be
rolled alongside two others at the top tier, and a mutator that has to be alone is a
game mode.

The cost is the **only balance dial** this system has, and the only thing the admin
dashboard can bend without a rebuild (`mutationCostOf`). The override is a scratch pad:
once a number is settled it belongs on the entry in `MUTATIONS`. Bending a cost
deliberately does *not* reorder the catalog — `MUTATIONS` is authored hardest-first and
`sortByCatalog` reads that order, so a run's printed roll stays stable while a number is
being swept.

## The costs are measured, not felt

Every number was set from the same experiment: a fixed board on a fixed map, the same
seeded run with the rule ON and OFF, and the answer is **how much shorter the run gets**.
That is what a point is. The board is 400 turrets of ten kinds packed at the core on
Confluence at the first mutating tier, three seeds a cell. A rule the instrument cannot
see there — one that reads the terrain, one that waits for the last waves — was measured
somewhere it can, noted below.

| rule | cost | life lost | what the number is |
|---|---|---|---|
| Hungry Mechs | 6 | −26% | and +32%, i.e. a *gift*, before the damage half of a meal was put back |
| Speedy | 5 | −16% | |
| Reconstruction | 5 | −10% | |
| Conquest | 4 | −2% | the least-trusted number here — see below |
| Mech Virus | 4 | −7% | −10% on a thin line, which is its board |
| Overshields | 4 | −12% | |
| Armored Swarms | 3 | −4% | −9% against small guns, which it is for |
| Hydrophobic | 3 | −1% | −20% on Shoals; taxes 6% of the buildable ground on the driest map and 66% on the wettest |
| Leadership | 3 | −5% | on a run that reaches the tier fives at all; nil before wave 36, where they start |
| Mitosis | 3 | −7% | |
| Amphibious | 2 | −2% | −9% on Shoals, and 0.7 crossings a body averaged over the nine maps |
| Shield Towers | 2 | −1% | |
| Volatile | 2 | −2% | |

**One rule spends into the brutal band**: Hungry Mechs, at the ceiling, because a wave
that eats itself into one body carrying forty times the health and twenty times the bite
is not a harder wave, it is a different fight.

**Conquest is the one number to distrust**, and it is priced with that said out loud.
The instrument's board is four hundred turrets in a blob that is dying anyway, and what
Conquest costs a player is the *line* — a thin one, held for ten waves, where every gun
lost is a gun shooting back. It measured −2% and was authored at six on a hunch; four is
the compromise. The honest thing is to measure it on a real board.

## The roll

**The count comes in and the budget is spent on it**, rather than the budget deciding
how many. Filling greedily until the purse ran out would make every high tier a five-rule
run and every low one a three-rule run — a ramp the point costs already provide — and it
would take the count away from the ladder, the one place a difficulty should be legible
in advance. What a player should not predict is *which* rules, not how many.

**The pass is a shuffle and a walk**: take each rule the remaining budget covers until the
count is met. A single walk can strand a third of the budget by taking a dear rule early,
so the roller runs it `ROLL_TRIES` (24) times and keeps the best — **most rules** first,
then **most points spent**.

Spending the budget is the whole difficulty curve, which is why it is the tiebreak and
not an afterthought: a roll that habitually left points on the table would make tier 10
and tier 4 the same run.

It never overspends and never repeats a rule. It can return fewer rules than asked for,
but only when the catalog cannot honestly do better.

**Every rule is in every draw on every map.** The catalog used to hold map-bound rules
(Hydrophobic, Amphibious) that only a world naming them could play; all maps are equal
now, so a terrain rule reads whatever terrain it lands on — Hydrophobic on a dry map is a
cheap slot, and that is the roll's business. `exclude` stays for a caller that wants a
rule out of one draw.

## Budget and count per tier

Both are arithmetic on the tier index, for the same reason `RUNGS` is: a ladder that
extends must not need a table re-authored. Both are also **dials on the tier**
(`RungKnobs`), so what is authored here is what a Reset returns to.

```
tier    1    2    3    4    5    6    7    8    9   10
points  0    0    0    0    8   10   11   13   15   17
rules   0    0    0    0    3    3    3    3    4    4
```

The first four tiers spend nothing — Incursion through Nemesis are the same script at a
quarter, a half, three quarters and the whole of its count, a size ramp and not a rules
ramp. The roll starts at `MUT_FIRST_TIER` (index 4).

**A dearer rule and an extra rule are different kinds of harder**, which is why the count
climbs so much more slowly than the budget. Points buy **weight** — the same slots, filled
with worse things. The count buys **breadth**, and breadth is what invalidates a way of
playing outright, because every rule added is another answer the board has to hold at the
same time. Breadth is the scarcer of the two.

Zero is a legal count and it is what the named difficulties carry. Five (`MUT_COUNT_MAX`)
is the ceiling for the same reason the cost ceiling is six: nothing in the catalog is
written to be read alongside that many others.

An invariant, checked at import: the first mutating tier must be able to pay for its own
full roll at the lightest cost the scale allows, or the easiest mutating difficulty would
quietly be the one with the fewest rules.

---

# The rules

## Hungry Mechs — 6

One body in twenty walks in with an appetite and the wave eats itself down into fewer,
fatter units. A hungry unit is not a new kind, so the level editor's arithmetic still
describes exactly what arrives.

**Rarer and hungrier, and the two moved together.** Halving the share while doubling the
appetite leaves about the same number of bodies eaten across a wave — but concentrated:
half as many swollen units, each carrying twice the pool. A different fight rather than a
harder one.

**The payout is the point.** A devoured unit is removed without ever being killed, so it
pays no drop at all, and the eater still drops only what its own kind drops. Twenty meals
cost twenty bodies' worth of salvage and hand back one, on top of a unit carrying
forty-one times the health it spawned with.

**A meal is worth double the prey's *max* health**, not what was left of it — anything
else would make a hungry unit worth less the harder the player was already fighting,
which reads as the mechanic switching itself off under pressure. Nothing else crosses
over: not shields, force fields, auras, statuses, armour or speed.

**A meal also carries the eaten body's bite**, and this is why the rule used to be a gift.
A meal that moved health only spent the swarm's *numbers* — which is what a swarm hurts a
line with — to buy one body a pool. Twenty runts do twenty runts' damage; one body
carrying all twenty pools does one runt's. Measured: a run under Hungry Mechs lasted
**thirty per cent longer** than the same run without it. It is a share of the eater's own
weapon, not of what it ate: an ironhide1 that eats a starhart3 comes out firing a great
many runts' worth of its own gun.

The 5%-per-meal swell is art only — the hitbox never moves. At twenty meals a fed unit
draws at double size, which is the only warning the player gets of how much health is
walking at them.

## Speedy — 5

Twice as fast and immune to slow. Two halves of one rule, because either alone has an
answer: doubled speed is answered by a liquid turret, slow immunity by not building one.
Together they say the thing the mutator is for — the time between the drop zone and the
base is gone, and no amount of water buys it back.

**It adds no health, which is why it costs what it does.** Every other dial makes bodies
harder to kill; this shortens the window they can be killed in. Damage per second is
unchanged and damage per *wave* is halved, so it is worth roughly a doubling of the
swarm's health to every emplacement — while the audit arithmetic, which counts bodies and
health, sees nothing at all.

**The immunity is to the slow, not to the status.** A soaked unit is still soaked: still
wet, still puts out a fire, still takes whatever the ammunition does. Cancelling the
status outright would have quietly deleted the fire-dousing rule.

## Reconstruction — 5

Every body dies twice: down, `RECONSTRUCT_DELAY` seconds on the ground, then up again
whole. Nothing rises twice — the risen body carries a mark, so the rule is exactly one
generation deep the way Mitosis is and a lane cannot become a loop.

**A doubling of the work, not of the swarm.** The field never holds more bodies than the
script sent — a corpse is off the board while it waits — so nothing about the crowd, the
physics or the drop zones changes. The second pass arrives *behind* the first: the bodies
that rise are the ones that already walked deepest.

**The ledger only counts the second death.** A first death counts no kill and does not
clear its wave. (No death has paid scrap since the income became the core's clock —
`docs/economy.md` — so the rule adds work and nothing else.) Neither does anything else that answers a death — Volatile
does not detonate a body that is coming back and Mitosis does not split one.

`RECONSTRUCT_GRACE` is how long the sim keeps trying to stand a corpse up before writing
it off; a body with nowhere to stand is booked as the kill it always was rather than
holding its wave open forever.

## Conquest — 4

A turret the swarm brings down **changes sides**: same ground, same health, same
footprint and resolved stats, barrel swung round at the core. The player then has to shoot
down the thing they paid for, with the guns standing next to it.

It invalidates a way of playing outright: every board built on a dense block of turrets
arms the swarm in proportion to how well it was built. A forward line of repeaters is a
forward line of repeaters pointed at the core the moment it breaks.

**A turret is only taken when it truly dies.** The relics that refuse a death (Undying
Legion's charges, the Phoenix roll) are asked first and all are spent before the swarm
gets its hands on anything. A revive is "this did not die"; this rule is about what
happens when something does.

**Every taken gun shoots**, whatever it used to shoot at — the swarm's copy has no bodies
to pick between, so a conquered airburst shells the line exactly as a repeater does. The
two turrets with no gun stay exceptions: a fixer mends nothing and a tractor drags
nothing, so taking one costs the player the block and hands the swarm a wall.

**It comes back as stubborn as it was**: handed the charges the turret was *born* with, so
an Undying Legion board hands over turrets that have to be killed twice. It never gets the
Phoenix roll — that is an unlimited coin flip the run owns, and handing it over would make
a conquered turret unkillable for exactly the runs that bought the relic.

`CONQUEST_HP` 0.6: a full pool would make a broken line an unbroken enemy line.
`CONQUEST_RATE` 0.7: the rule is the turret pointed the other way, not a better turret.

## Mech Virus — 4

An elite that kills buildings instead of fighting them. `VIRUS_CHANCE` of a wave's bodies
carry it; **killing the carrier is what sets it off** — it jumps to the nearest turret
within `VIRUS_JUMP_TILES` and eats `VIRUS_DPS` of that turret's own ceiling a second.

**A share of the pool, deliberately.** A flat rate would be death to a tacker and a
rounding error to a Giant Bulwarked repeater; five per cent is twenty seconds whatever the
building is, so the rule reads the same on the first wave and the fiftieth and cannot be
out-built. Plating does not shave it either — a status a plate could blunt would just be
the ground mechs again.

**It does not stop when the turret does.** It hands on to the nearest turret in range, and
that one to the next, walking through a dense line one gun at a time. **The gap is the
counter**: a line with air in it is a line the virus cannot cross.

The other counter is a stand-up — a revived turret comes back clean. Selling an infected
turret is not an escape: a removal order on an infected building is its *death*, with
everything a death does.

## Overshields — 4

Every force field is five times the pool it was — unit bubbles and shield-tower domes
alike. Pool, cap and regen all carry the factor, so a scaled field breaks later, refills
proportionally faster, and is dark for exactly the same cooldown when it pops.

It used to be a ladder column (`shieldScale`, 1.00 compounding to 5.00) on the reasoning
that a shield is measured in *seconds of absorbed tower fire* and so has to track the
player's firepower rather than the health curve. That reasoning is exactly why this is a
mutator rather than a deleted feature — but as a per-tier column it was a second
difficulty curve nobody could see. As a rule it is legible: named, on the card before
Deploy, in force or not.

**What it costs the player is time, not bodies** — the same audit-invisible currency
Speedy and Volatile tax. Rolled beside Shield Towers it is worth considerably more than
its price, and that is the catalog working as intended: rules that compound are what a big
budget is for.

## Armored Swarms — 3

Every tier 1–3 body gains `ARMORED_ARMOR` (10) flat armour at spawn. The heavies take
none — an ironhide3 already carries the plating that matters, and doubling down would make
the rule "the same fight, but longer". What it hardens is the **swarm**.

It used to be a ladder column (`lowTierArmorBonus`), which was a mutator wearing a
ladder's clothes: a second curve that only bit at the top half, only against three unit
tiers, and only against small guns.

**Regressive by calibre, on purpose.** Armour is a flat shave floored at a tenth of the raw
hit, so +10 is nothing to a piercer's 140 and 1.55× effective health against an
autocannon's 28 — but it floors a tacker's 9 and an airburst's 3 outright. That asymmetry
*is* the mutator: not "the swarm is tougher" but "the cheap guns stop counting", and the
answer is calibre.

Priced heavy rather than brutal because that answer exists and is affordable. Rolled early,
before the tree has anything with weight behind it, it is the harshest 3 in the catalog.

## Hydrophobic — 3

A turret built within `HYDROPHOBIC_RANGE` (10 cells) of any water floor fires at
`HYDROPHOBIC_RATE` (0.3) of its rate. The shoreline — the ground that overlooks the
crossings, the ground a naval front makes you want — is the ground that costs you most of
your damage to hold.

**The same rule is a wall on two maps and a rounding error on four.** Share of buildable
ground taxed: Shoals 66%, Quagmire 34%, Maelstrom 21%, Confluence 6%. It costs 20% of a run on Shoals and 1% on
Confluence — the widest spread of any rule in the catalog, and the reason it is not priced
for its best day.

**The reach and the rate move together** and were set as a pair. Widening the band taxes
more board; deepening the cut makes each taxed square worth less. At 8 cells and half rate
a player shrugged it off by building one turret deeper.

**Fixed when the turret is placed**, never re-read — the water does not move, and a turret
carries its own reload rate rather than the sim asking the terrain every tick. **It slows
the reload, not the volley**: shots still leave the barrel at the weapon's spacing; what
stretches is how often a volley starts. A tractor turret has no reload and is untouched.

**The obvious rework does not work** — measured, not guessed. If the swarm *routed* through
water (the flow field charging less for a wet cell), crossings roughly double and a dry map
goes from 0.2 stacks to 1.2 — and the run gets **easier** anyway: a discount deep enough to
pull a lane into the water is deep enough to buy a detour, and a detour is more seconds
under the guns than the stacks are worth (+5.5% run life at a 0.45 discount, 0% at 0.8).
Anyone reaching for this again should reach for the stack's own numbers instead.

## Leadership — 3

Every body within `LEADERSHIP_TILES` (15) of a **live tier five** takes at most
`LEADERSHIP_CAP` (10) off any one hit — not a share, a ceiling. The escort stops caring
what is fired at it and starts caring only how often.

A board built on big single shots — a repeater's cannon, a railhead's rail, a barrage's
shells — is a board whose whole damage is the *size* of each hit, and this prices that at
ten whatever the tin says. A board built on rate is untouched. The rule does not make the
swarm tougher so much as it makes one half of the roster worthless while a tier five is on
screen, and hands the other half the wave.

**The leader is not under its own order** — that is the whole answer to the rule. Capping
it too would make the one body that must die the one body that cannot.

**It caps everything**, not just shots: fire, a held beam's tick, a blast's share, a
spitter's hit — every point of damage goes through one door and the ceiling is on that
door. That is also why it is not the damage-over-time nerf it looks like: a burn tick is
already worth a fraction of the cap.

**A late-run rule, which is most of why it is three.** The script's first tier five walks
in on wave 8 of ten, and tier fives are 1.4% of bodies over the three waves they appear in
— so for seventy per cent of a run this is an empty slot the deploy panel has already
charged for.
Where it applies it is savage: the ceiling deletes 87% of a mixed line's damage — 0% off a
tacker, 11% off a coil, 35% off a torch, 61% off an autocannon, 71% off a barrage, 90% off
a repeater, cleaver or piercer.

`LEADERSHIP_PERIOD` / `LEADERSHIP_LINGER` are the armour aura's own bargain: capped
continuously rather than flickering with the beat, lost a beat after walking out.

## Mitosis — 3

Every body the player kills breaks into tier-1 bodies, more the heavier the thing that
died: `MITOSIS_BROOD` = `[_, 1, 2, 4, 7, 12]`. A kill stops being the end of a fight and
becomes the start of a smaller one.

**A rule about throughput, not health.** The brood is the cheapest thing in the game. A
turret that kills fast barely notices it. What it takes apart is the board built to kill a
few *expensive* things — the long-reload heavies, the single-target snipers, the piercer
line whose whole answer to an ironhide3 is one shot that is worth it. Those turrets spend
the same reload on a runt, and the mutator hands them eleven more.

**It terminates because a brood body does not brood** — a property of the *body*
(`Sim.ubrood`), read once when it dies, not a zero in the table. Putting the guarantee on
the unit is what lets the table be a dial: it used to live in the arithmetic (tier 1 bred
nothing), which quietly made "does this terminate?" a question about a balance number.

Tier 1 breaking into one is what makes the card's "every enemy" literally true rather than
nearly true — a player should never have to work out which of the things dying in front of
them the rule applies to.

**A brood body is a real unit and pays a real drop**, and answers for its parent's wave:
the wave is not cleared, and its XP not banked, until the brood is down. The standing rule
is that no body is quietly worth more *or less* than another of its kind.

**A leak is not a death** — a body that walks off the board was never killed, so it leaves
no brood. **The brood keeps its parent's layer**: a flyer leaves flyers, a hull leaves
hulls, else you drop runts into deep water.

`MITOSIS_SPREAD` 36px keeps twelve from being one stack; `MITOSIS_TRIES` 6 means a body
dying against rock leaves a smaller brood than the table promises, which is the honest
outcome.

## Amphibious — 2

A walker that steps into water comes out **better**: faster, tougher, harder to kill and
healing, up to `AMPHIBIOUS_MAX_STACKS` (5) times over a route. It is the map turned against
the player — Quagmire was drawn so a walker never has a dry route, and under this rule the
crossings the player is trying to hold are the exact squares that make the thing walking
through them worse.

**Each bonus is a share of the unit's own numbers**, so one rule reads the same on a 150-hp
dartback1 and a 22,000-hp dartback5. The one exception is **armour**, flat and deliberate:
the dartback line's T1 has armour 0, so a percentage would skip the very body the rule is
most about.

**A stack is an entry, not a duration** — taken on crossing from dry ground into water and
never again until the body has left and come back. The gain is paid for by *route*, not by
loitering: a swarm that pools in a ford does not ratchet.

**The percentages are of what it spawned with**, read once per stack. Off the current pool
the stacks would compound — and worse, a hungry unit's meals would feed the wading bonus
and the wading bonus the next meal. Two rules multiplying each other is not a number anyone
can tune.

`AMPHIBIOUS_SPEED` is 0.1 (+50% at the cap), short of Speedy's doubling on purpose. It was
+250%: the headless playtest lost the map on wave 4 with every leak a dartback1, at half the
authored counts. `AMPHIBIOUS_ARMOR` 0.5 was 10 — a body wearing ten plates is a body a
tacker hits for its floor. The health is the rule's weight; the plating is the edge that
makes a lobber worth more than a tacker.

It does not touch the hitbox, the layer or the kind: a waded dartback1 still cannot swim.

## Shield Towers — 2

A 3×3 shield tower rises every `SHIELD_TOWER_SPAWN_PERIOD` (30s), up to
`SHIELD_TOWER_MAX_ALIVE` (20), and stands a **red** dome over the ground around it. Any
projectile crossing the dome is absorbed. Only with the dome down can the body be hurt; a
destroyed shield tower is gone for good.

Instant weapons — piercer, coil, cleaver, railhead, furnace's held beam, tether's lock beam
— are not absorbed, exactly as unit force fields never absorb them, which quietly makes the
beam roster the tower-breaking roster.

**It rises on empty turret ground, and that is the whole cost.** It only lands where a
turret could have stood and nothing already stands, so what it takes is one unbuilt
emplacement. It asks `board.ts` (`groundClear`, `domesClear`) rather than restating the
rule — it used to carry its own, wanting buildable *rock*, which was right while turrets
stood on the highground; turrets stand on the floor now, so every dome on every map was
landing on a hill and the rule's whole cost was zero.

**It holds no ground against the swarm** — solid to a placement, thin air to a body. **It
never touches what the player built**: a roll over a turret is thrown away and re-rolled,
and a board with no free ground raises nothing that period. It used to *entomb* a turret it
landed on; that is gone, and with it the one way this rule could undo a decision already
paid for.

**A dome is a target like any other** — a turret takes the nearest thing in range, body or
building, so a dome standing closer than the wave is what the guns around it are shooting.
It used to be idle work only, which meant a dome inside a defended pocket never came down
while anything was on the field.

**The dome reforms whole, not by degrees, and is not interruptible.**
`SHIELD_TOWER_SHIELD_DELAY` (10s) starts when the dome *breaks* and nothing restarts it. It
used to be a delay in front of a trickle, and a dome at 12% is not a weaker obstacle, it is
one more volley. Hits used to restart the clock, which turned the rule inside out: a board
with enough turrets never let four idle seconds happen, so the reform mechanic only existed
for players already winning. Breaking it is also the only thing that starts it — a dome
chipped to 40% and left alone stays there forever.

The body pool is **four times** the dome's, and that ratio is the pacing: a body that dies
inside one window never gives the trade a chance to happen. A long body is what turns a
shield tower into an objective you have to commit to.

**The wave curve.** Both pools are set by the wave the tower rises on and compound at
`SHIELD_TOWER_WAVE_GROWTH` (1.1⁵ ≈ 1.61, a wave being five of the old script's) — ~2.6× by
wave three, ~6.7× by five, ~26× by eight, ~107× by ten. A flat 15,000 was an obstacle for
most of a run and then scenery: a late
board focuses thousands of damage a second onto one point. The pools grow the way the
player's damage does, by a percentage a wave. It is **fixed at spawn**, never re-read,
which is what makes clearing them promptly worth anything.

**The mega shield tower** (`SHIELD_TOWER_MEGA_WAVE`) is about **reach**: a dome 16 cells
across, wider than most turrets reach from one emplacement, so a whole section of the board
has to be pointed at it. It used to multiply the pools by five as well, which put a cliff in
the middle of a curve meant to be smooth — the wave curve already passes 5× around wave
eighteen.

The dome is red, deliberately not the amber of friendly shields: amber means "the swarm is
protected by one of its own", red means "the **rule** is protecting them".

## Volatile — 2

Every enemy detonates when it dies and the blast damages towers. This is the rule that
turns tower health from a dead field into a mechanic: nothing else in the game hurts a
tower.

**It taxes point-blank play specifically.** A blast reaches from a little over two cells (a
runt) to six (a tier five), so the emplacements built against the lane feel it hardest, in
proportion to how many bodies die at their feet and how heavy they were. A long-range board
is untouched. The mutator does not say "your towers take damage", it says "the kill zone
cannot also be the front row" — a layout problem rather than a stat problem.

**The reach climbs with the tier** (`VOLATILE_RADIUS`, 2.25 → 6 cells) and that is what
gives the rule its shape rather than just its strength: spacing a line off the lane by one
turret buys immunity from the chaff and none at all from the thing that was worth killing.

**The damage scales with tier, not level** (`VOLATILE_DMG`). Scaling with level would make
the rule unpayable at the top tier for the same reason armour is never level-scaled: tower
health does not climb the ladder, so neither may the thing that spends it.

A wrecked tower is gone. What a swarm of detonating runts costs is turrets — the scrap to
stand them back up and the silence in the kill zone until they do.

The ring drawn for the pop is sized from `VOLATILE_RADIUS`, so what a player sees is exactly
what took the damage.
