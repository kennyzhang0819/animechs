# The skill tree

`game/skills.ts` is the tree, `game/progress.ts` holds what a save has bought, and
`components/SkillTree.tsx` is the board — the **Tech** tab beside the track on the progress
screen.

## The shape

**One line a turret, ten nodes long, bought left to right.** A node belongs to exactly one
turret and to nothing else: the third node of torch's line is torch's, and owning it says
nothing about any other gun. What a node does it does to *every* turret of that kind standing
on the board, the moment it is bought.

**A node costs one point and a line is a chain.** Rung 4 is not for sale until rungs 1 to 3 are
owned, and handing back rung 2 hands back 3 and up with it — the chain is never held with a
hole in it. The board buys and refunds whole spans for that reason: clicking rung 6 of an empty
line spends six points, right-clicking rung 2 of a six-deep line returns five.

**The tenth rung is the line's own.** The nine under it are the flat dials — rate, damage,
reach, blast, plating, pierce, scatter, traverse, healing — escalating down the line; the tenth
is authored per turret and is worth roughly three of them.

## The points

**One a level, levels 1 to 100** (`SKILL_POINT_LEVELS`, `economy.ts`), so a save holds at most
100 and the twenty-one lines together want 210. **The tree can never be filled**, which is the
whole design: a hundred points across the roster is a hand, not a checklist.

Nothing stores a balance. What a save has is its level; what it has spent is the record in
`Progress.skills`; what is left is the subtraction (`skillPointsLeft`). Refunds are free and
unlimited — this is a loadout, not a purchase, and a player who cannot re-spend it will simply
never spend it.

Past level 100 the XP curve is the flat wall and a level pays nothing.

## Where it meets the sim

`Progress.skills` rides into `TechState.skills` (`techOf`), and `Sim.refreshSpecs` folds it with
`skilledTower` — over the shelved upgrade branches (`upgrades.ts`) and under the run's relics,
so the composition order is: stock stats → upgrades → skills → relics. The sandbox passes no
tech at all and therefore plays every turret stock.

This is **not** `upgrades.ts`. Those branches are the old per-turret tree, dealt by the level
track and switched off there (`UPGRADES_ON_TRACK`); nothing here reads them and they stay
intact where they are.
