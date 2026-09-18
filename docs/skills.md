# The skill tree

`game/skills.ts` is the tree, `game/progress.ts` holds what a save has bought, and
`components/SkillTree.tsx` is the board — the **Tech** tab beside the track on the progress
screen.

## The shape

**Ten global dials, twenty ranks each.** A rank costs one point, and every rank of every node
applies to **every turret on the board** — there is no turret on this screen and no order to buy
in. A point in Payload is a point every gun you will ever build gets.

| dial | a rank | maxed |
| --- | --- | --- |
| **Payload** | +2% damage, blast included | +40% |
| **Cadence** | +2% attack speed | +40% |
| **Reach** | +1.5% range, and the shot flies as far | +30% |
| **Plating** | +1 armour — a flat shave off each hit | +20 |
| **Hull** | +4% turret health | +80% |
| **Blast Radius** | +2% splash radius | +40% |
| **Stabilisers** | 2% less scatter | 40% less |
| **Servos** | +3% traverse | +60% |
| **Muzzle Velocity** | +2% shot speed, over the same ground | +40% |
| **Penetrators** | a body punched through every four ranks | +5 bodies |

Penetrators is the one coarse dial, because pierce is a count of bodies and not a percentage: a
rank cannot be a fifth of one, so four buy a body and the twentieth is the fifth of them.

**Nothing here regenerates.** A dial that put health back would be a different game — the answer
to a chewed turret is the fixer and the restorer, which are cards a run buys.

## Why it is not one line a turret

It was, and that was the wrong shape twice over. A line was a bet on a *gun* rather than on a way
of playing, and the roster is twenty-three guns — so a hundred points spread over it bought a
tenth of the tree and nothing a player could feel. Worse, a line had to be bought in order, which
made the first nine rungs a toll on the tenth.

Ranks are the answer: a dial is legible at a glance, twenty of one is a real decision about what
the whole board is for, and nothing has to be explained.

## The points

**One a level, levels 1 to 100** (`SKILL_POINT_LEVELS`, `economy.ts`), so a save holds at most
100 and the tree wants 200. **It can never be filled**, which is the whole design: a hundred
points over ten dials is a hand, not a checklist.

The climb ramps to those hundred levels rather than charging a flat price for each —
2,500 XP for the first and 500,000 for the hundredth, the whole of it about ninety-nine Nemesis
clears. See `docs/economy.md`.

Nothing stores a balance. What a save has is its level; what it has spent is the record in
`Progress.skills`; what is left is the subtraction (`skillPointsLeft`). Refunds are free and
unlimited — this is a loadout, not a purchase, and a player who cannot re-spend it will simply
never spend it.

A buy that cannot be paid for in full **takes what it can afford** rather than refusing, which is
why the board never has to explain a price: clicking the twentieth pip with three points in hand
buys three ranks.

Past level 100 a level costs `XP_PER_LEVEL` and pays nothing.

## Where it meets the sim

`Progress.skills` rides into `TechState.skills` (`techOf`), and `Sim.refreshSpecs` folds it with
`skilledTower` — over the shelved upgrade branches (`upgrades.ts`) and under the run's relics, so
the composition order is: stock stats → upgrades → skills → relics. The dials apply in the order
`SKILL_NODES` lists them, which has to be fixed: they compose by multiplication and addition both,
and another order would price the same save differently. The sandbox passes no tech at all and
therefore plays every turret stock.

This is **not** `upgrades.ts`. Those branches are the old per-turret tree, dealt by the level track
and switched off there (`UPGRADES_ON_TRACK`); nothing here reads them and they stay intact where
they are.
