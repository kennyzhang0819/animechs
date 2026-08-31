# Authoring waves: the blueprint and its transforms

The campaign follows the Bloons TD model: **one 50-wave script for every
world**, and what makes each world's campaign its own is a set of *family
transforms* — re-castings like "the crawler line arrives as ships here" —
applied to that script on load.

## The blueprint

`public/levels/blueprint.json` is the only wave script that exists. It is a
`LevelDoc` — `{ id: "blueprint", waveGap, script }` — of raw per-kind counts,
edited in the admin level editor (**Edit level** on any map card in `/admin`)
or by hand in the JSON. Difficulties are prefixes of it (waves 1–20 / 1–35 /
1–50, see `RUNGS` in `game/ladder.ts`), so one document carries the
entire game.

There are no per-world documents any more. The dev save API
(`/api/levels`) refuses every id except `blueprint`.

## Transforms

A world's rules are edited in the level editor's rail and saved into the
blueprint document's `transforms` map (`{ "<worldId>": [rules] }`); the
lists on `WORLDS` entries in `game/levels.ts` (`LevelSpec.transforms`) are
the shipped defaults a pre-rules document falls back to. Each rule:

```ts
{ from: ["crawler"], to: [{ family: "naval" }] }                     // swap, tier for tier
{ from: ["support"], to: [{ family: "support" },
                          { family: "navalSupport" }] }              // even split
{ from: ["crawler", "support"], to: [{ family: "air" }], multiply: 2 } // pooled, 2x the bodies
```

Families are the rows of `UNIT_TREES`, addressed by key: `ground`,
`support`, `crawler`, `air`, `naval`, `navalSupport` (`boss` is not
transformable — a boss is an event, not a volume).

Semantics, all enforced in `applyWaveTransforms`:

- **Tier survives the move.** A rule pools its `from` families *per tier*
  and deals the pool into its `to` families at the same tier: an atrax (T2
  crawler) becomes a minke (T2 ship), never a random hull.
- **Rules read the original wave.** No rule sees another rule's output, so
  order never matters and chains cannot double-transform. The price: each
  family may appear in at most one rule's `from` (validated at module load —
  a bad list fails the build). Unclaimed families pass through untouched. A
  rule may target one of its own sources ("support → half support, half
  naval support").
- **Weights** split a pool; unset weights mean an even split. `weight: 2`
  and `weight: 1` send two thirds and one third.
- **`multiply`** scales the pool before the split, so `multiply: 2` on a
  rule sending crawlers to air returns twice the air bodies — and twice the
  drops, which the editor's ladder check will price for you.
- **Counts stay integers** by largest-remainder rounding per wave, per rule,
  per tier (ties to the earlier target), so a split never invents or loses a
  body beyond rounding the pool itself, and the same blueprint always
  derives the same script.

## In the editor

The level editor always edits the blueprint's raw counts, whichever world
opened it. The left rail holds the world's **editable rule list** — toggle
FROM families, add TO targets with weights, set the pool multiplier — and a
rule list that cannot mean one thing (a family claimed twice, a boss rule)
is flagged in place and refuses to save. The **ramp, payouts (with each
rung's total enemies and health) and totals are priced on the derived
script** — what that world actually sends. The wave cards open on the
derived, read-only **as played** view; **Show blueprint** flips them to the
editable raw counts.

Mind the map: a transform that moves volume onto a layer the map has no
drop zones for (naval units on a dry map) sends nothing at all, exactly as
if the blueprint had asked for it directly — the Drop zones panel shows
which doors exist.
