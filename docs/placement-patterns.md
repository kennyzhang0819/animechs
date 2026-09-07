# Placement patterns

**Every turret gets one rule about where it likes to stand.** Stand it there
and it is better; stand it anywhere and it is exactly the turret it is today.
Nothing here is a penalty on naive play — the floor is the current game.

This is a design document. None of it is built.

## Why bother

The board already has real estate: towers build on **open ground only**
(`Sim.canPlace`) — never on a hill — so a map's open floor is the whole of
where a defence can go. Today that geography decides *how many* turrets fit and *what they can
see*, and nothing else. A rock shelf against the water plays the same as a
rock shelf in the middle of a plain.

A placement pattern makes the shelf itself an ingredient. Two consequences
worth having:

- **The same seventeen turrets play differently per map**, without a line of
  balance work. A map with a long thin ridge is a duo map; a map with a
  four-wide seam over the choke is a spectre map. The author decides by
  drawing, not by writing a rule.
- **The level track stops being the only axis.** Upgrades buy *stats*,
  mutators take them away; a pattern buys neither — it asks a question about
  the ground and it is answered by looking.

## What other games do with adjacency

Six systems worth stealing from, and the one lesson each carries.

**Civilization VI — districts.** A district scores off what it is next to:
Campus +1 per adjacent mountain, Commercial Hub off a river, Industrial Zone
off mines. Firaxis' stated goal was to make "the map more important than it
had ever been", and the trade-off is real because building a district
*destroys* the improvement under it. **Lesson: the bonus sources must be
scarce and located.** If every tile could feed the pattern, the pattern is a
flat buff with extra reading.

**Loop Hero — tile combos.** A Meadow beside a Rock becomes a *Blooming*
Meadow. Nine Rocks in a 3×3 become a Mountain Peak: +48% hero health, and it
**spawns a harpy every two days**. **Lesson: the best patterns change the
thing rather than scale it, and the biggest ones carry a downside.**

**ISLANDERS — placement scoring.** Every building scores off what is inside
its bubble; late buildings *penalise* one neighbour type while rewarding
another, which is what forces a player to keep two separate districts instead
of one optimal blob. **Lesson: penalties, not bonuses, are what stop uniform
clumping.**

**Luck be a Landlord — symbol adjacency.** 150+ symbols paying off their
neighbours. Community consensus is that "adjacency is the strongest thing in
the game", and the item that removes the adjacency requirement is the best
item by a wide margin. **Lesson: adjacency compounds. Cap it, or it becomes
the only thing anyone builds around.**

**Rogue Tower — elevation and resources.** Towers get `+1 × elevation` damage
and `+0.5 × elevation` range; a Mana Siphon must be on the *same level* as its
Mana Vein to draw from it, and Houses pay `adjacent towers × wave number`.
**Lesson: terrain-derived bonuses read instantly in a tower defence.** Nobody
needs the rule explained twice.

**Mindustry itself — deliberately none.** Turrets have no adjacency at all
upstream; what buffs a turret is a separate *building* next to it (overdrive
projector, mender, force projector). **Lesson: we are adding something the
source game does not have, so it has to be legible on its own** — no player
arrives expecting it.

### The failure mode, named

An adjacency system dies when it has **one global optimum**. If the answer is
always "a solid block of the best turret", the pattern is not a decision, it
is a chore you perform before the wave. Four guards, all used below:

1. **Cap every stack.** Nothing counts past 2–5 sources.
2. **Vary the shape.** A run, a block, a shoreline, an *empty* neighbourhood —
   five turrets wanting five different shapes cannot all be satisfied at once
   on one shelf.
3. **Two of the seventeen want solitude.** Scatter and foreshadow are worse
   when packed, which is the ISLANDERS lever and the only thing that makes a
   sprawling defence beat a dense one.
4. **Orthogonal only, footprint-relative.** Diagonals double the neighbour
   count and halve the legibility. A 4×4 spectre has sixteen edge cells; it
   should not therefore have sixteen times the pattern.

## The seventeen

Grouped by **band** — the bands below predate the three-tier scrap economy
(`TOWER_TIER`, `game/economy.ts`) and map onto it roughly: copper and
titanium are tier 1, thorium tier 2, plastanium and phase tier 3. One
condition in the cheap bands, two or a shape in the middle, a compound with
a cost above that, and a rare authored terrain feature at the top.

### Copper band — the pattern that teaches the system

| turret | pattern | rule |
| --- | --- | --- |
| **duo** | **Firing line** | +8% fire rate per other duo in the same unbroken orthogonal run, counted both ways, max 4 → **+32%** |

Duo is 1×1, costs 60 scrap and a board holds dozens. A *run* rather than a
neighbour count is deliberate: a 2×2 huddle and a straight row both give two
orthogonal neighbours, so counting neighbours would teach nothing about shape.
Counting the run teaches the whole system in one turret — **the picture on the
board is the bonus** — and it draws a duo wall along a ridge, which is what a
duo wall should look like.

### Titanium band — one condition each, five different primitives

| turret | pattern | rule |
| --- | --- | --- |
| **hail** | **Battery** | two or more hails orthogonally adjacent → **−25% reload** |
| **scorch** | **Backdraft** | +12% damage per *different* turret kind orthogonally adjacent, max 3 → **+36%** |
| **arc** | **Earthing** | footprint touches any water cell → **+30% damage, +1 chain jump** |
| **scatter** | **Crown** | *no* other turret orthogonally touching its 2×2 → **+20% range** |
| **wave** | **Cistern** | footprint touches shallow water → **+50% wet duration**; deep water → **+100%** instead |

Five turrets, five primitives, and they are the whole vocabulary the rest of
the game reuses: same-kind threshold, different-kind count, terrain touch,
isolation, graded terrain touch. A player who has bought this band has been
taught every idea in the system without reading anything.

They also pull against each other on purpose. Scorch wants to be buried in a
mixed cluster; scatter wants to be alone; hail wants a square of its own kind.
One shelf cannot serve all three, which is the second guard above doing its
job on the cheapest turrets in the game.

Arc and wave are the two that ask the **map** rather than the board, and both
ask about water, which already exists and is already authored (`FLOOR_SHALLOW_WATER`,
`FLOOR_DEEP_WATER`). No new terrain is needed to ship this band — that matters,
because a pattern nobody can satisfy on the current maps is a pattern nobody
learns.

### Thorium band — two conditions, or a shape

| turret | pattern | rule |
| --- | --- | --- |
| **salvo** | **Magazine** | **+1 shot per burst** per orthogonally adjacent salvo, max +2 |
| **lancer** | **Capacitor bank** | an arc within 2 cells of the footprint → **−40% charge time**; a second arc → **−60%** |
| **ripple** | **Dug in** | no open floor orthogonally adjacent to the 3×3 — walled in rock on every side → **+25% range, −15% minimum range** |
| **parallax** | **Anchor** | two or more of its 2×2's four sides fully on open floor, **and** no other parallax within 6 cells → **+30% pull, +15% range** |

Salvo's is the first pattern that changes a turret's *shape of fire* rather
than a multiplier — three salvos in a row are a different weapon, not a
stronger one, which is the Loop Hero lesson at a small scale.

Lancer's is the **named pair**, and it names arc for a reason: the two are
the same weapon at two scales, and arc opens ten levels earlier. A player who
kept their opening arcs standing gets paid for it, which is exactly the thing
`upgrades.ts` says a stat branch exists to reward — *keep what works*.

Ripple's asks for a **3×3 hole in a platform with rock on all four sides**,
which is the scarcest geometry on any current map and needs an author to
deliberately leave one. That is the point: ripple is the longest-ranged
non-phase turret in the game and it should have one good seat per map.

Parallax's is the first pattern with a positive and a negative clause at once.

### Plastanium band — compound, and one with a real cost

| turret | pattern | rule |
| --- | --- | --- |
| **fuse** | **Shield wall** | **+1 pierce and +10% damage** per orthogonally adjacent fuse (max 2) — and every fuse in the wall loses **15% range** |
| **swarmer** | **Relay** | a salvo, cyclone or other swarmer adjacent → **+1 missile per volley**, max +2, and a relayed swarmer targets the *strongest* body in range rather than the closest |
| **cyclone** | **Crossfire net** | +8% fire rate per **distinct other turret kind** within 3 cells, max 5 → **+40%** |
| **tsunami** | **Reservoir** | 3+ water cells adjacent to its footprint → **+40% fire rate**; if any of them is deep, **wet duration doubles** |

Fuse is the **Mountain Peak**: the only pattern in the game that takes
something away. Fuse is already a 90-range point-blank shotgun, so −15% is a
genuine cost and a wall of three is a decision rather than free value.

Cyclone's wants **five different kinds within three cells** — a hard ask that
can only be met by a player who owns most of the roster and is willing to build
a genuinely mixed emplacement instead of a monoculture. It is the anti-spam
pattern, and it is priced in *breadth of ownership*, which nothing else in the
game charges for.

Tsunami's needs real authored coastline. See the terrain section.

### Phase band — the deepest three

| turret | pattern | rule |
| --- | --- | --- |
| **spectre** | **Foundry** | **+5% damage per ore-bearing rock cell** under its 4×4 footprint, max 10 → **+50%** |
| **meltdown** | **Heat exchange** | a heat cell (hotrock / magmarock / steam vent) touching one side **and** a coolant cell (water / ice / cryofluid) touching another → **+35% beam damage, and the beam does not break for reload while its target lives**. Either alone: **+15%** and nothing more |
| **foreshadow** | **Solitude** | no other turret within 8 cells → **+40% damage**; each turret inside that radius takes 8% of it back |

These three are where new terrain earns its keep, and they are deliberately
the hardest to satisfy — a phase turret costs a campaign's worth of farming
and its best emplacement should be a place on the map you went looking for.

Meltdown's is the one I would build first if only one of the three shipped. It
wants **two opposed terrain features touching the same 4×4** — a vent on one
side and water on the other — which is a thing an author places once per map,
on purpose, and which every player will recognise on sight for the rest of the
campaign. It is the closest thing here to a Loop Hero combo: not a bigger
number, a different weapon.

Foreshadow's is the isolation pattern taken to its end. Its range is 500 and
its sort is `strongest`; it was never a line turret, and parking it in one
should read as a mistake the moment the number goes grey.

## Terrain

The current palette is **grass, stone, dirt, sand, darksand, shallow water,
deep water**, three wall families (stone / dirt / dark rock), pines, boulders
and shrubs (`PALETTE`, `game/maps.ts`). Mindustry ships far more. The full
inventory, from `Blocks.java`'s environment region, with a verdict per group.

### Everything Mindustry has

**Serpulo floors** — stone, crater-stone, char, basalt, hotrock, magmarock,
sand, darksand, dirt, mud, dacite, grass, salt, snow, ice, ice-snow, shale,
moss, spore-moss, redmat, bluemat, pebbles, tendrils, metal-floor (×5 +
3 damaged), dark-panel (×6), dark-metal, base-zone.

**Serpulo liquids** — shallow water, deep water, tainted water, deep tainted
water, sand-water, darksand-water, darksand-tainted-water, tar, pooled
cryofluid, molten slag.

**Erekir floors** — arkycite, arkyic stone, rhyolite, rhyolite crater, rough
rhyolite, regolith, yellow stone, yellow stone plates, carbon stone, ferric
stone, ferric craters, beryllic stone, crystalline stone, crystal floor, red
stone, dense red stone, red ice, and eight **steam vents** (stone, basalt,
rhyolite, carbon, arkyic, yellow-stone, red-stone, crystalline).

**Static walls** — stone, dirt, dacite, ice, snow, dune, sand, salt, shale,
spore, shrubs, graphitic; plus the Erekir set (regolith, yellow-stone,
rhyolite, carbon, ferric, beryllic, arkyic, crystalline, red-ice, red-stone,
red-diamond).

**Trees and props** — pine, snow-pine, spore-pine, white-tree, white-tree-dead,
spore cluster, nine boulder families, redweed, pur-bush, yellow coral.

**Ore overlays** — floor ores (copper, lead, coal, scrap, titanium, thorium,
beryllium, tungsten, crystal-thorium) and **wall ores** (thorium, beryllium,
graphite, tungsten).

Every sprite listed is already sitting in
`public/mindustry/sprites/blocks/environment/`. Nothing needs downloading;
adding a floor is an atlas entry plus a `PALETTE` row.

### Verdicts

**Take the whole Erekir set out of scope.** Rhyolite, regolith, arkycite,
crystalline stone and the red-stone family are a different planet's palette and
they will not sit next to grass and pine without the map looking like two games
stapled together. The **steam vents** are the one exception — a vent reads as a
vent on any ground, and `stone-vent` / `basalt-vent` are Serpulo-native anyway.

**Ore overlays are the cheapest win in this entire document.** A wall ore is an
overlay on a *wall* cell, which is exactly the cell a turret stands on. It costs
**no pathfinding change at all** — `blocked` and `wall` are untouched, it is a
new per-cell layer the renderer draws over the rock — and it hands the phase
band a per-cell socket to key off. Spectre's Foundry is written against it.
Build this one first.

**Hazard floors are the expensive win, and they carry a real cost.** The README
is explicit that shallow water has no slow because *"a speed penalty is a
pathfinding input"*. That reasoning is correct and it cuts both ways: a slow
floor that the flow field does not price is **free** — the swarm walks straight
through tar and nothing happens. A slow floor the field *does* price becomes a
**soft wall**: the swarm routes around it, and an author gains a brush that
shapes a lane without blocking it. That is a genuinely good tool and it is also
a change to `flowfield.ts` cost accumulation, not a cosmetic addition. Decide
that before painting any of it.

### The shortlist

Three batches, cheapest first.

**Batch 1 — overlays on rock. No new rules, no pathfinding, immediate payoff.**

| add | why |
| --- | --- |
| **wall ores** — thorium, graphite, beryllium, tungsten | the socket the phase band keys off; spectre's whole pattern |
| **graphitic wall** | a fourth buildable rock family, and a natural seam colour |
| **floor ores** — copper, titanium, thorium, coal, scrap | pure decoration today, but it makes a map read as a place worth defending |

**Batch 2 — floors that are only art. Atlas + palette, nothing else.**

| add | biome it opens |
| --- | --- |
| **shale** + shale wall + shale boulder | dark cracked badlands |
| **snow, ice-snow** + snow wall + snow pine | a winter map |
| **moss, spore-moss** + spore wall + spore pine + tainted water | the corrupted valley |
| **basalt, char, crater-stone, dacite** + dacite / dune wall | volcanic |
| **metal floor, dark panel, dark metal** | a ruined installation |
| **salt** + salt wall | flats |

Each is three sprite variants and a `PALETTE` row. Six biomes for roughly the
work of one.

**Batch 3 — hazard floors that carry a rule. Read the pathfinding note first.**

| floor | Mindustry's rule | ours |
| --- | --- | --- |
| **mud** | speed ×0.6, `muddy` | mild slow; the natural apron around any water |
| **tar** | speed ×0.19, `tarred`, drowns | hard slow, and **burning does double damage on it** — the scorch/incendiary terrain |
| **ice** | drag ×0.35, speed ×0.9 | units *slide* — they overshoot the corner they were turning |
| **hotrock / magmarock** | heat 0.5 / 0.75, emits light | ignites what walks it; **meltdown's heat side** |
| **pooled cryofluid** | `freezing`, speed ×0.5 | rare deep slow; **meltdown's coolant side** |
| **molten slag** | `melting` — speed ×0.8 and **armour ×0.8** | armour shred, which is the one debuff the game has no answer to today (`max(dmg - armor, 0.1 × dmg)` never scales) |
| **steam vent** | steam attribute, animated | **meltdown's heat side**, and a visible landmark |

Slag is the interesting one. The wave-authoring doc calls armour "a permanent
multiplier" that "never scales with level" — a fortress costs a duo line ten
times its printed health at every tier forever. A floor that shaves armour is
the first terrain in the game that answers a stat the ladder cannot touch, and
it belongs in exactly one place per map.

## Building it

### The architecture problem, up front

`Sim.statsFor(kind)` resolves stats **per kind**, not per turret — one
`TowerStats` object shared by every duo on the board (`sim.ts:1200`, filled by
`refreshSpecs`). A placement bonus is per *turret*. That is the whole of the
work.

It is not much work, because there are only five readers: the tower tick and
`bulletFor` in `sim.ts`, the continuous beam in `renderer.ts`, the range ring
in `game.ts`, and `refreshSpecs` itself.

The cheap shape:

- A new `game/placement.ts` holding one entry per turret —
  `{ id, name, blurb, evaluate(tower, terrain, towers) → Bonus }` — with
  `Bonus` a small fixed record of multipliers and addends:
  `{ damage, reload, range, splash, pierce, shots, wet }`. Anything a pattern
  wants outside that record needs a full spec clone; **keep patterns inside the
  record** and none is ever needed.
- `Tower.bonus: Bonus` — computed on placement, and recomputed for every tower
  within `maxPatternReach` cells of any placement or sale. Nothing recomputes
  per tick.
- `statsFor(t: Tower)` beside the existing `statsFor(kind)`, folding the
  tower's bonus over the kind's upgraded spec. The five readers switch over.

### The part that decides whether players ever learn it

**The build ghost must show the bonus before the click.** Civ VI prints the
adjacency number on the tile you are hovering; ISLANDERS draws the bubble and
puts a yellow number over every source inside it. An adjacency system with no
preview is invisible — players place turrets for twenty hours and never find
out. This is not polish, it is the feature.

Concretely: the placement ghost (`game/game.ts`, the 2d overlay) prints the
pattern's name and its current value under the footprint, and marks the cells
or turrets feeding it. When the value is zero it says so in grey, which is how
a player learns the rule exists at all.

Second: **the turret's hover card carries the pattern in one sentence**,
beside its stats. Seventeen sentences, and the whole system is documented
inside the game.

Third: on the field, a bonused turret wants a mark — the smallest possible one.
A tinted corner pip, not a badge.

### What this does to the ladder

Nothing the arithmetic can see, and that is a problem to be honest about.
`__ladder.audit()` counts bodies and health; placement bonuses are pure
**player-side DPS**, invisible to it in exactly the way *Speedy* is invisible
to it. So:

- The caps above are the balance. A perfectly-played board runs roughly
  **+25–35%** effective damage, not double.
- `SCRAP_START` (7,500, a hundred-odd tier-1 turrets) is the campaign's difficulty anchor and it
  is hand-tuned by feel. A dozen duos that can form firing lines are worth more
  than a dozen that cannot. **Re-feel the opening after this lands**, and expect
  the number to want to come down.
- There is a natural mutator in here: **Interference — placement patterns give
  nothing this run.** Brutal band, 5–6 points. It costs the player exactly what
  they built into their layout and the audit sees nothing, which is the
  signature of every good rule in that catalog.

### Order of work

1. Wall ores + graphitic wall (batch 1). No rules, and it unblocks spectre.
2. `placement.ts`, `Tower.bonus`, per-tower `statsFor`. Ship with the copper
   and titanium bands only — six patterns, all satisfiable on today's maps.
3. The build-ghost preview and the hover-card sentence. Do not ship 2 without 3.
4. Thorium and plastanium bands.
5. Batch 3 hazard floors, and the flow-field decision they force.
6. The phase band, once its terrain exists.

## Sources

- [Designing Civilization VI's distinctive districts system](https://www.gamedeveloper.com/design/designing-i-civilization-vi-i-s-distinctive-districts-system)
- [Adjacency bonus (Civ6) — Civilization Wiki](https://civilization.fandom.com/wiki/Adjacency_bonus_(Civ6))
- [Loop Hero combos: All tile combos and effects — PC Gamer](https://www.pcgamer.com/loop-hero-combos-cards-tile/)
- [Synergy — Loop Hero Wiki](https://loophero.fandom.com/wiki/Synergy)
- [Scoring — ISLANDERS Wiki](https://islanders.fandom.com/wiki/Scoring)
- [Islanders Score & Strategy Bible — Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=1704459130)
- [Synergies — Luck be a Landlord Wiki](https://luck-be-a-landlord.fandom.com/wiki/Synergies)
- [Map features — Rogue Tower Wiki](https://rogue-tower.fandom.com/wiki/Map_features)
- [Towers — Rogue Tower Wiki](https://rogue-tower.fandom.com/wiki/Towers)
- [Mindustry `Blocks.java` — the environment region](https://github.com/Anuken/Mindustry/blob/master/base/src/mindustry/content/Blocks.java)
