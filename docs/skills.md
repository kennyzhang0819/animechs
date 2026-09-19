# Upgrades — the global dials

The **Upgrades** tab, beside the track on the progress screen. `game/skills.ts` is the tree,
`game/progress.ts` holds what a save has bought, and `components/SkillTree.tsx` is the board.

The code says *skills* because `game/upgrades.ts` is something else — the shelved per-turret
branches the level track used to deal. Upgrades is the word a player sees; skills is the word the
files use, and the two never meet.

## The shape

**Four global dials, and no cap on any of them.** A rank costs one point, and every rank of
every one applies to **every turret on the board** — there is no turret on this screen and no
order to buy in. A point in Attack Damage is a point every gun you will ever build gets.

| dial | a rank | glyph |
| --- | --- | --- |
| **Attack Damage** | +2% damage, blast included | `barrel` |
| **Attack Speed** | +2% attack speed | `gear` |
| **Health** | +4% turret health | `plate` |
| **Range** | +1.5% range, and the shot flies as far | `lens` |

The faces are the **mod glyphs** (`components/modArt.ts`) — the same drawing the mod for that
stat wears, so a player has one legend for both screens rather than two.

**Four, and they are the four a player already thinks in.** It was ten for a while — armour,
blast radius, scatter, traverse, shot speed and pierce beside these — and the extra six were dials
nobody had a plan for, which is a longer screen and not a bigger decision.

**Nothing here regenerates.** A dial that put health back would be a different game — the answer
to a chewed turret is the fixer and the restorer, which are cards a run buys.

## Why it is not one line a turret

It was, and that was the wrong shape twice over. A line was a bet on a *gun* rather than on a way
of playing, and the roster is twenty-three guns — so a hundred points spread over it bought a
tenth of the tree and nothing a player could feel. Worse, a line had to be bought in order, which
made the first nine rungs a toll on the tenth.

Ranks are the answer: a dial is legible at a glance, and a hundred points poured across four
faces is a real statement about what the whole board is for.

## The points, and the missing cap

**One a level, levels 1 to 100** (`SKILL_POINT_LEVELS`, `economy.ts`), so a save holds at most
100 and a rank costs one. The climb ramps to those hundred levels rather than charging a flat
price for each — 2,500 XP for the first and 500,000 for the hundredth, the whole of it about
ninety-nine Nemesis clears. See `docs/economy.md`.

**A dial has no ceiling a player can reach.** The pool is the only limit there is: all 100 points
may go into Attack Damage if that is the board you want. `MAX_RANKS` is 1000 — a runaway guard
against a stuck key or a bad save, set far past what any save can pay for, and **nothing prints
it**. A board that drew "12 / 1000" would be drawing a bar that never fills.

This is why the board is four big buttons and not four pip rows, and why the points are printed
**once, big, at the top**: they are the whole of the arithmetic. Each button prints the bonus its
dial is AT and nothing else.

Nothing stores a balance. What a save has is its level; what it has spent is the record in
`Progress.skills`; what is left is the subtraction (`skillPointsLeft`). Refunds are free and
unlimited — this is a loadout, not a purchase, and a player who cannot re-spend it will simply
never spend it.

A buy that cannot be paid for in full **takes what it can afford** rather than refusing, which is
why the board never has to explain a price: shift-clicking a dial with three points in hand buys
three ranks.

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
