# Difficulty — the ladder

One climb per world, ten tiers, four names, one script. Code: `game/ladder.ts`.
The rules a high tier is played under are `docs/mutators.md`; what a run earns is
`docs/economy.md`.

## What a tier is

**Every tier plays the whole authored script** — all fifty waves, the same fifty every
time, and **every body at the same health but one**. What changes is how many come and
what rules they come under.

| tier | name | count sent | rules |
|---|---|---|---|
| 1 | Incursion | a quarter of every wave's count | none |
| 2 | Onslaught | half | none |
| 3 | Scourge | three quarters | none |
| 4 | Nemesis | the script as authored, every body | none |
| 5–10 | Nemesis +1 … +6 | the full swarm | a mutator roll that spends more and returns more each step |

So a tier is three numbers: the share of the count it sends (`COUNT_SCALE`), what its
mutator roll may spend and how many rules it returns, and how much the XP it pays is
multiplied by (`tierXpBonus`). **The four named difficulties are a size ramp; the six
above them are a rules ramp on top of the biggest size.**

Indices are 0-based everywhere in code and in `window.__ladder`, because tier 0 indexes
`RUNGS` and an offset there would put a +1 in the middle of the arithmetic. Nothing
player-facing prints that index — everything goes through `rungLabel`, so the internal
index and the shown name meet in exactly one place. "Level" is never the word for it: a
level is the player's.

**The bodies at a different health are the objectives**, and that is the same size ramp
wearing the only shape it can. A mission puts down **one** body whatever the difficulty —
a quarter of one boss is not a body, and `scaleWave` floors a nonzero count at one on
purpose — so every `OBJECTIVE_KINDS` body pays the tier's count share in **hit points**
instead (`tierObjectiveHpScale`, applied in `unitHpOnRung`). That is the Sovereign, the
Borer's whole train, the railgun emplacement and both Wardens: a quarter of their health
at Incursion, three quarters at Scourge, all of it from Nemesis up.

Nothing else about them moves: armour, speed, hitbox and drop are what `UNIT_STATS` says at
every tier — drops in particular, for the same reason the level curve leaves drops alone.
Without this, the bottom of the ladder ended on the hardest thing in the game, unscaled,
while everything in front of it came at quarter strength.

The Borer's launch ramp (`wormRamp`) rides on top of the share, not instead of it: the
tier says how big a train is and the ramp says how much heavier this one is than the last.

## The health curve is not the ladder's — it is the tide's

A tier used to be an enemy **level** as well. That column is authored to zero on every
tier now: difficulty is count and then rules, which is what makes the top tier a different
fight rather than the same fight eight times over.

What turns the curve instead is **the script running out**. Past the last authored wave
the tail goes again, `LEVELS_PER_DOUBLING` heavier each cycle, forever (`Sim.loadStep`).
The two axes are cleanly split: a tier says how big the swarm is and what rules it plays
under, the tide says how long the run has been going.

`HP_PER_LEVEL` is Mindustry's own 1.06, and **nothing else scales** — armour, speed,
hitbox and drop stay at base forever. 1.06¹² = 2.01, so twelve levels is exactly one
doubling, derived rather than typed. Levels are the right knob for the tide because a
level moves health and nothing else: the swarm that comes back is the swarm the player
just beat, walking at the same speed in the same shape, and the only question it asks is
whether the guns bought so far still cut it. Counts would change the picture; speed would
change the puzzle.

The mechanism stays available — `unitHpAtLevel`, `LevelSpec.enemyLevel`, the balance
dashboard's dial — because a map or a mutator may still want it.

## What a tier pays

**Scrap is fixed per kill and never scales.** A tier's run banks the same scrap as any
other, because scrap is what the turret prices are authored against and a tier that paid
more scrap would be an easier fight, not a harder one.

**XP scales, and that gradient is the whole reason to climb.** `XP_STEP_PER_RUNG` is 0.5:
tier n carries a raw weight of 1 + 0.5n, normalised so that `XP_BASE_TIER` (Nemesis — the
whole script, no rules) is ×1, which is the tier `MISSION_XP` is priced for. Incursion pays
×0.4 of it and Nemesis +6 pays ×2.2, so the top tier pays ×5.5 what Incursion does.

**Linear, not compounding, because the fight does not compound any more.** The old loot
bonus compounded at 1.34 a tier to keep pace with health that compounded at the same rate;
with health flat, a compounding payout would make the top tier the only one worth playing
by a factor of fourteen — and the mutator roll, the thing that actually makes a high tier
harder, is not fourteen times harder. The step was a third; playtests said the rules a high
tier rolls make it a good deal more than a third harder.

A clear pays the same the first time and the fifth. There is no first-clear bonus: a tier is
worth exactly what its kills are.

## Extending the ladder

`RUNG_COUNT` is ten because ten is where the tuning has been checked, not because anything
is finite. **Every tier's dials are arithmetic on its index** (`RUNGS`), and `clearedByMap`
is an unbounded int per world, so raising `RUNG_COUNT` is the whole edit an eleventh tier
needs.

**The ladder is climbed once per world.** `RUNGS` says what a tier *is*; how far up it a
save has got is a per-world number (`clearedByMap` in `progress.ts`), so standing on tier 8
somewhere says nothing about anywhere else.

A tier's colour is its only identity beyond its number: four anchors — green, gold, red and
the purple the hidden top tier wore — evenly spaced and interpolated. Label and colour clamp
identically, so they can never disagree.

## The dials

`RungKnobs` is tunable without a rebuild: the admin dashboard bends them in module state,
the balance document persists what is bent, and everything in the sim and the lints reads
through `rungKnobsOf` so an edit takes effect on the next spawn. **The authored values in
`RUNGS` stay the source of truth** — once a number is settled it belongs there.

- `level` — enemy level; authored 0 on every tier, the dial is for experiments.
- `mutationPoints` / `mutationCount` — the mutation pair. Dials here rather than constants
  in `mutation.ts` because they *are* the tier's difficulty now. Both zero on every named
  difficulty, which is the whole of what "the campaign as authored, at a size" means.
  Everything outside `ladder.ts` asks via `tierMutationPoints` / `tierMutationCount` rather
  than the authored curves directly.
- `xpBonus` — the reason to climb.

Only the mutator count has a ceiling (`MUT_COUNT_MAX`): a hand-edited document asking for
forty simultaneous rules would deploy a run nobody wrote, so it is enforced on write and on
load, not only in the stepper. Overrides are keyed by the tier's **ordinal** as a string
("1"–"10") — a tier has no name, and reordering the table would be a redesign; a document
naming a tier the table no longer has is dropped on load.

## Weighing a run

**Strength is printed health.** That is the whole measure, and it is weapon-agnostic on
purpose: the player never fields one turret, so any single-turret denominator says more
about the denominator than about the wave. Armour, shields and air ride along as
**composition** — shares reported next to the health, never multiplied into it.

`budget()` weighs one tier; `waveGuide()` is one row a wave; `stageAudit()` prices the three
stages against their turret bands; `audit()` walks the ladder. Because the count is scaled in
`specForTier` and nowhere else, the sim, the audit and the picker's detail card all read the
same swarm.

A wave's `share` — its slice of the whole run's health — is the number to author against: 5%
is filler, 25% is a spike, and a stage's **last** wave should be its heaviest or the stage
tails off into the next.

## The checks (`window.__ladder.check()`)

**`SCRIPT_BODIES` = 50,000.** A run sends exactly this many bodies, as a rule and not an
observation, so "how far did the swarm get" is the same question on every map and the drop
table prices a known quantity of salvage. Pad or trim the cheapest kind in the waves that
already field it.

**The stage rule** — each stage has to be able to buy its own band (`STAGE_BOARDS`). A band
its stage cannot afford is content the run never fields; a band its stage buys by the hundred
was the previous stage's turret with a bigger number on it.

**The debut note** — a unit whose armour meets nothing that can efficiently hurt it, inside
the first stage where a fresh save's board is tackers. This is a note, not a gate: nothing is
ever unkillable (the 10% floor means a tacker always lands 0.9), so a heavily armoured debut
costs more scrap, which is a legitimate thing for a script to ask for. It reports the size of
the ask so an author choosing it is choosing it. It reads printed armour — Armored Swarms is
deliberately not priced in, because the lint is about the script an author wrote.
