# MechSwarm

Tower-defense swarm prototype: flow-field pathfinding for up to 22,000 units,
WebGL2 instanced rendering, and towers (1×1 up to 4×4) that block movement and
reroute the horde in real time.

## Run

```bash
npm install
npm run dev   # Next.js + Turbopack
```

**The game is a desktop game**, shipped to Steam as an Electron app
around the same bundle, and played with a mouse and a keyboard — there is
no touch input and no phone layout. `npm run desktop:dev` runs the dev
server inside the shell, which is where to develop; `npm run desktop`
builds and launches the static export; `npm run desktop:pack:steam`
leaves the Windows and Linux depots under `desktop/release/`. The shell
lives in `desktop/` (its own npm package — `cd desktop && npm install`
once); see [docs/desktop.md](docs/desktop.md).

### Build number

`game/version.ts` holds `BUILD`, shown small and grey at the bottom-right
of every screen. **Increment it by one in every commit that changes what
the game does** — sim, targeting, balance, rendering, UI. A playtest
report only means something against the number that was on screen: a
stale tab or a cached bundle looks exactly like a fix not working.

## Architecture

- `game/constants.ts` — grid, base placement, tower/unit tuning
- `game/levels.ts` — unit stats and wave-script plumbing; the authored
  script itself (50 waves) lives in `public/levels/1.json`, loaded by
  `loadLevelDocs()`. Six upgrade trees: ground, support, crawler, air and
  the two **naval** lines (risso→omura, retusa→navanax), which travel on
  the water layer and cannot leave it
- `game/economy.ts` — **the economy**: scrap (in-run money), XP (meta
  progress), the fixed per-tier drop table, the three turret tiers and
  their scrap prices, the sell refund, the level curve, the first-clear
  bonus, and the base's hundred lives
- `game/ladder.ts` — the **ten-rung ladder** (`RUNGS`: the mutator roll
  and the XP bonus each; the enemy-level dial is wired and authored to
  zero), and the audit/check arithmetic over the authored script — the
  **stage table** (`stageAudit`) that the turret prices are tuned against
- `game/tech.ts` — the tech tree, paid in **skill points** (one a level):
  turret unlocks, the upgrade rungs, the pace and slot switches, and the
  level gates on the deeper tiers
- `game/upgrades.ts` — the **turret upgrade branches**: a chain of rungs
  under every turret, folded into its live `TowerStats`. **Every rung is
  bought once**: two stat steps (one point each), a one-shot ammunition
  swap (two points), and an **ultimate** (three points, level-gated) that
  changes what the turret is. **Only duo and arc have an ultimate written
  so far** — the
  other fifteen are authored by hand as they are designed; adding one is a
  fourth entry in a branch with `tier: ULTIMATE_TIER` and its id in
  `UPGRADE_KINDS`, and nothing else
- `game/mutation.ts` — the **mutators**: the catalog of rules a run can be
  played under, what each is worth in points, and the roller that draws
  three or four of them to fit a difficulty's budget
- `game/progress.ts` — the save: lifetime XP, rungs cleared per world,
  the nodes owned, game speed, build-bar loadout. Level and free points
  are derived from XP and from what is owned, never stored
- `game/storage.ts` — **where the save file lives**: one slot behind
  three calls, localStorage in a browser and a file on disk under the
  desktop shell (through the bridge `desktop/src/preload.ts` puts on
  `window`). The only place the game knows it might be on a desktop
- `game/maps.ts` — map documents: terrain layers, spawn circles, per-layer
  exit masks — see [docs/authoring-maps.md](docs/authoring-maps.md) for how
  to draw one and how to check it
- `game/editor.ts` — the level/map editor model behind the admin views
- `game/terrain.ts` — terrain from a map document when one exists, else
  seeded value-noise worldgen: mountain ranges, a carved meandering valley
  with a branch lane, forests, outcrops, floor fringes, decor
- `game/flowfield.ts` — grid occupancy + one Dijkstra pass seeded from every
  goal cell (the base is the fallback), refined by an eikonal sweep into a
  per-cell direction field; units sample it bilinearly (pathfinding is
  O(map), not O(units)). Cells pay for **where** they are as well as how
  far: single-file slots cost extra (`NARROW_COST`) and so does hugging the
  rock (`EDGE_COST` over `EDGE_REACH`), so the cheapest route is not the
  shortest one — it runs down the middle of a lane and will take a longer,
  roomier way round rather than scrape a corner
- `game/sim.ts` — units in struct-of-arrays typed arrays, counting-sort spatial
  hash (separation + projectile hits), towers, projectiles, effects
- `game/tiles.ts` — **the ground tiles and the hill blocks**, the game's
  own terrain art, painted at load on a 16-pixel grid. A floor is a base
  colour with ONE soft rounded mark on it (a light patch, a shaded stone
  on dirt, a wide low dune on sand, a glowing spot on hot rock), its dark
  tone eased toward the base; its second painting is plain ground, and
  that plain one fills two of the three slots, so a mark lands on one
  cell in three. A wall is shaded the way Mindustry shades its walls: the
  top-right corner in the light tone, the bottom-left in the dark, and a
  wide mid band running diagonally between them with wandering edges —
  then one small pale pebble on the mid band, and the second painting is
  the bands alone. A 2×2 cluster is one block shaded corner to corner across
  the whole of it. The props are painted the same way (`PROP_STYLE`,
  `paintProp`): a boulder is two or three discs overlapping, a pine a ring
  of lobes round a crown with the trunk a dark dot, a spore cluster three
  pods, each shaded by one diagonal across the whole silhouette with no
  outline round it, and the shrub squares are patches of
  ground with round tussocks rather than things standing on it. The atlas,
  the menu background, the map thumbnails and the editor palette all read
  from it; `npm run gen:tiles` writes the palette's PNGs into
  `public/tiles/`
- `game/atlas.ts` — the sprite atlas, composited at load time from Mindustry
  sprites in `public/mindustry/` plus procedural regions; **swap any region
  for custom art** (units are white sprites tinted per instance, and already
  rotate to face their heading). The two water floors are the only cells
  packed 3x3, because the water shader samples off the tile
- `game/renderer.ts` — WebGL2 instanced sprites: static terrain, shadow and
  wall batches, one dynamic batch in painter's order, and a shield pass.
  Water is a batch and a program of its own — Mindustry's `water.frag`,
  ported, so the sea swells and its bright bands drift across the map
- `game/game.ts` — rAF loop, input, 2d overlay (placement ghost), stats
- `components/MechSwarm.tsx` — React shell: HUD (scrap, lives, XP), rung
  picker, six-slot build bar with prices and its loadout picker, game-speed
  switcher, results screens, canvases
- `components/MenuBackground.tsx` — the title screen's ground: the game
  seen from above before anyone has built on it. A lane meanders through
  rock rolled fresh every launch (a floor/wall pair, a second rock in
  patches, pockets of open floor, sometimes a heat gradient), and the
  swarm walks it — daggers and crawlers in the crowd, maces and the odd
  fortress among them — each turning with the lane's bends and striding
  on the field's own leg cycle, with a few flares weaving escort overhead.
  Every biome gets its turn: scenes hold for `SCENE_HOLD` seconds and
  dissolve into the next, rolled in the background. Rasterized once a
  scene; a few dozen sprites a frame. It holds still under
  prefers-reduced-motion and stops when the tab is hidden
- `app/globals.css` — **the kit**: `.ms-btn` / `.ms-pane` / `.ms-seg` /
  `.ms-bar` and their variants are Mindustry's nine-patch UI sprites
  (`public/mindustry/sprites/ui/button*.9.png`, `pane*.9.png`) written as
  CSS — a 3px `#454545` bevel with square corners on a black fill, gold on
  hover, white on press, sunk to `#252525` when disabled, gold-washed when
  a toggle is on (`aria-pressed` / `aria-selected` drive it, so a button
  never carries its state in its class list). Every screen is built from
  these; Tailwind utilities on top only size and place them
- `game/layout.ts` — **where every tech-tree node sits**: one editable
  integer grid over turrets, utilities and upgrade rungs alike. The
  authored cells are the starting point; `public/tree.json` overrides them
  and the admin dashboard's Tech tree tab writes it
- `components/Board.tsx` — the pan-and-zoom camera every board is drawn on
  (tech tree, mutator codex, tree editor), and the chrome they share
- `components/TechTree.tsx` — the tech tree board, and the tab strip that
  switches to the codex beside it. Every upgrade rung is a **node with an
  edge into it** — turret → rung 1 → rung 2 → ultimate — laid out on the
  same grid the turrets are, not a row of chips under its turret
- `components/techIcons.tsx` — what every tech node LOOKS like: block
  sprites, the upgrade glyph vocabulary, the surge icon. Shared, so the
  game's board and the layout editor draw the same faces
- `components/TreeEditorView.tsx` — the layout editor: drag a node, it
  snaps to the grid, Save writes `public/tree.json`. It draws the real
  faces at the real sizes — composing a layout against name labels would
  be composing against the wrong picture
- `components/MutationTree.tsx` — the **mutator codex** as a board of its
  own: one thumbnail per rule, severity in the border, the rule on hover
- `components/LevelEditorView.tsx`, `MapEditorView.tsx`, `BalanceView.tsx` —
  the admin authoring surfaces
- `components/SandboxView.tsx` — the admin **Sandbox** tab, and the one
  door in the game where a mutator is CHOSEN rather than rolled: pick a
  world, a difficulty and any combination of rules (over the tier's budget
  if you like), and deploy. It hands off as a query string onto the game
  page — `/?sandbox=1&world=…&tier=…&mut=…`, consumed and stripped by the
  sandbox effect in `MechSwarm.tsx` — so the exact run that reproduced a
  bug is a URL you can paste into a report. The run starts in sandbox
  mode: whole tree unlocked, caps lifted, every pace offered

In dev builds the running `Game` instance is exposed as `window.__mechswarm`
for console poking, and the ladder's tuning surface as `window.__ladder`
(`.spec(n)` for a rung's playable spec, `.budget(n)` for what the
arithmetic says it costs, `.stages()` for the stage table, `.grind()` to
print it).

## Controls

Mouse and keyboard (`game/game.ts`); the game is a desktop game and there
is no touch input.

| | |
|---|---|
| build | left press, drag to chain |
| demolish | right press, drag to chain |
| inspect a turret's range | left click, with no tool picked |
| pan | middle drag, WASD/arrows, two-finger trackpad scroll |
| zoom | wheel, trackpad pinch |
| pause / menu | space / esc, or the two buttons in the top-right corner |
| fullscreen | F11 (Ctrl+Cmd+F on macOS), in the desktop shell |

The zoom floor is the whole map in frame with a little padding
(`ZOOM_FIT_PAD`); the ceiling is 12.

## Progression

**There is one run in the game and ten difficulties to play it at.** Every
rung sends the whole authored script — all fifty waves, wave 1 to wave 50,
the same fifty every time, **and every body at the same health**. A rung is
what its mutator roll may spend, how many rules it returns, and how much
the run's XP is multiplied by. It is shown to the player as *Level 1*
through *Level 10* and nothing else; there are no named difficulties.

| rung | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| waves | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 |
| enemy health | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 | ×1 |
| rules rolled | 0 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 5 |
| mutator points | 0 | 8 | 10 | 11 | 13 | 15 | 17 | 19 | 20 | 22 |
| XP bonus | ×1.0 | ×1.3 | ×1.6 | ×1.9 | ×2.2 | ×2.5 | ×2.8 | ×3.1 | ×3.4 | ×3.7 |

**A rung scales the mutator roll and the XP, and nothing else.** Enemy
level — Mindustry's ×1.06-a-level health curve — is still a mechanism
(`HP_PER_LEVEL`, `LevelSpec.enemyLevel`, the balance dashboard's dial) and
the ladder no longer turns it: every rung is authored at level 0.
Difficulty is rules, not hit points. Every column is arithmetic on the
rung's index, so **an eleventh rung is one constant** (`RUNG_COUNT`).

### Two currencies that never touch

**Scrap is the run's money.** Every run opens with `SCRAP_START` (7,500),
every kill drops its tier's scrap, every wave staged pays a small bonus,
and every turret placed costs scrap. Selling returns the whole price
(`SELL_REFUND` is 1). Nothing carries between runs: a run is solved from its
opening board to its last wave on what it earns. Tiers are gated by wave
(`STAGES`): tier 1 only until wave 20, tier 2 from 21, tier 3 from 36 — so
every run has an early, a mid and a late game, and the opening board is
never the best turret the save owns. The income is tuned so a sensible
board clears all fifty first try.

**XP is the save's progress.** The same kills pay XP, the rung multiplies
it (the XP bonus above), and the **first clear of any (world, rung)** pays
`FIRST_CLEAR_XP` on top, multiplied the same way. XP turns into **player
level** through a power-law curve (`xpToNext`), and **every level is one
skill point** to spend on the tech tree.

| tier | scrap | XP |
|---|---|---|
| T1 | 1 | 2 |
| T2 | 3 | 5 |
| T3 | 8 | 12 |
| T4 | 20 | 30 |
| T5 | 50 | 80 |
| boss | 500 | 1000 |

**Drops are fixed.** A tier-1 body always pays this, on every rung, on
every map. Scrap income is a fact about the script, which is what lets the
turret prices be authored against it.

### Three stages, three tiers

The roster is cut into three tiers along Mindustry's build-cost order
(`TOWER_TIER`), and the run into three stages (`STAGES`): waves 1–20,
21–35 and 36–50. **A tier is priced so its stage is roughly what buys it.**
Against the shipped script:

| stage | waves | scrap paid | tier | prices | buys about |
|---|---|---|---|---|---|
| 1 | 1–20 | ~24,000 | duo, scorch, hail, arc, scatter, wave | 60–300 | 150 turrets |
| 2 | 21–35 | ~51,000 | swarmer, lancer, salvo, ripple, parallax, cyclone | 900–1,800 | 40 turrets |
| 3 | 36–50 | ~83,000 | fuse, tsunami, spectre, meltdown, foreshadow | 4,000–12,000 | 11 turrets |

The stage table (`stageAudit`, on the balance dashboard and the level
editor) is where this is checked; `check()` complains when a stage buys
too few or too many of its tier (`STAGE_BOARDS`). Selling the opening
board back in full is how the transition into the next tier is funded;
what each stage asks is when to make that swap.

### The tech tree

**The tree is paid in skill points and every node is bought once.** A
turret unlock is one point; so is each of the two stat rungs under it; an
ammunition swap is two; an ultimate is three. Tier-2 turrets wait for
level 4, tier-3 for level 10, ultimates for level 15 (`TIER_LEVEL_GATE`,
`ULTIMATE_LEVEL_GATE`). The tree holds close to a hundred points and a
full ladder on one world is about level 17, so nobody maxes it from one
world. **Every node can be refunded** for exactly the points it cost, from
the tip of its branch inward — a node still holding up a child does not
offer it — so a point is never a mistake to grind out of. Home and duo are
free. The pace strip stops at 4x; base plating is not sold.

### The base

**The base has a hundred lives (`LIVES_START`) and a leak bites by tier**
(`LEAK_LIVES_BY_TIER`: 1, 2, 4, 8, 16). A run is won for as long as any is
left. **A boss that reaches the base ends the run** whatever is left — a
script that builds towards one enemy must not have that enemy become
something you shrug off.

**A leak pays nothing.** `killsByKind` is the whole drop ledger and a body
that walked off the board was never killed, so the scrap and the XP a leak
costs are what the player would have had for stopping it.

### Mutators

Every deploy from Level 2 up is played under **mutators** — rules that
change what happens to a wave after it lands. **Nobody picks them.** The
**difficulty decides the budget and the count**, and that many rules are
rolled to fit it when you deploy. It is the StarCraft II model, and the
mode it exists for is endgame resource farming: the same fifty waves, a
different set of rules every time.

|  | the tech tree | a mutator |
|---|---|---|
| how it is got | paid for out of the bank | **rolled for you** at deploy |
| what it does | more turrets, faster pace | makes the run **harder** |
| how long it lasts | permanent capacity | **that run only** |

This replaces the old *mutation line*, a column of switches on the tech
tree earned one rank per boss felled. Nobody flips an optional handicap
with no reward attached — and the game had to be balanced as though
everybody did. So it became the opposite thing: mandatory, unchosen, and
attached to the maps that want it.

**Where it is mandatory:** **every deploy from Level 2 up, on every map.**
The gate is the ladder, not the world — a tier carries how many rules it
rolls and what they may cost (`RungKnobs.mutationCount` and
`.mutationPoints`, both dials on the balance tab), and Level 1 carries zero
of each. That is the whole of what "Level 1 is the campaign as authored"
means. The per-world `LevelSpec.mutators` switch is gone; it was never
turned on, and it could only ever say yes or no where the ladder can say
how much.

**A level may carry rules of its own, by design.**
`LevelSpec.intrinsicMutation` is a list of mutators a world is *always*
played under — **Maelstrom** carries **Overshields**, which is what makes
the naval front the shielded front. Three things follow, and they are the
whole contract: it applies at **Level 1** too (for a world authored with
rules on it, that *is* the campaign as authored); it is **never rolled**
(the roller is handed it as an exclusion, so a deploy cannot spend points
on a rule the run already has); and it is **never charged** (the tier's
budget buys the roll on top of it). The deploy panel lists it beside the
roll, tagged *always*, and `mutationsInForce` is the one place the two are
joined. This is not the old switch coming back: that said "this map is
allowed to mutate, at whatever strength the difficulty says", which put a
level in charge of a difficulty curve. This says "this map is the shielded
one", which is authorship.

**The costs are the only balance dial.** A mutator is worth points
(`MutationDef.cost`, 1–6 — light, heavy, brutal), a difficulty affords
them or does not, and which rules a difficulty sees falls out of the
arithmetic rather than a per-difficulty list. The count climbs far more
slowly than the budget: points buy **weight** (the same slots, filled with
worse things) and the count buys **breadth**, which is the scarcer of the
two. Both rows are the authored defaults, and both are knobs:

| rung | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| rules | 0 | 3 | 3 | 3 | 3 | 4 | 4 | 4 | 4 | 5 |
| points | 0 | 8 | 10 | 11 | 13 | 15 | 17 | 19 | 20 | 22 |

The roller shuffles the catalog, walks it taking whatever the remaining
budget covers, and keeps the fullest of two dozen such walks — **most
rules first, then most points spent**, because spending the budget *is*
the difficulty curve. The whole catalog is public: the upgrade screen
is two tabs, and the second is a **codex board** — the same pan-and-zoom
map the tech tree is drawn on, holding one thumbnail per rule. The border
colour is how bad it is (light / heavy / brutal) and the hover card is the
rule in a sentence; no cost, no tier, no arithmetic, because none of that
is a player's question. The one number on the screen is the points each
difficulty spends. The surprise is which rules turn up, never what exists. The deploy panel spells out
the roll in full before the button is pressed, and the run plays under
exactly what it showed.

**A mutator changes a wave after it spawns and never what the script
sends**, so every number in `ladder.ts` — wave counts, enemy totals, the
drop-ratio audit — stays true whatever was rolled. A rule that wants to
change the script is a wave transform, not a mutator.

**Volatile — 3 points.** Every enemy detonates when it dies, and the blast
damages the towers it reaches — about two cells, plus the body's own
hitbox, with the damage set by the body's **tier** (a dagger is a scratch,
a fortress a real dent) and never by its level, because tower health does
not climb the ladder and neither may the thing that spends it. This is the
rule that makes tower health a mechanic at all: **nothing in the base game
hurts a tower.** Every tower has a pool (`towerMaxHp`, footprint-scaled),
a hurt one wears the units' own red hp tint, and one at zero goes **down,
never away** — dark, silent, smoking, and back at full health ten seconds
later (`TOWER_DOWN_TIME`). What a swarm of detonating daggers costs is
windows of silence in the kill zone, the same audit-invisible currency
Speedy taxes — and it taxes **point-blank play specifically**: scorch,
fuse, arc and the duo wall on the choke feel it in proportion to how many
bodies die at their feet, while a long-range board barely pays. Selling
and replacing a downed tower is allowed; a rebuild is slower than the
timer for anything bigger than a duo.

**Overshields — 3 points.** Every force field on the field comes up **five
times the pool** it was — the bubble a quasar walks in with, and the shield tower
domes if Shield Towers is rolled alongside. Pool, cap and regen all carry
the factor, so a scaled field breaks later, refills proportionally faster,
and is dark for exactly the same cooldown when it pops. This was the
ladder's **shield scale** column until it became a rule nobody chose (see
above); five is the old top-rung value, kept whole. Like Speedy and
Volatile it costs the player **time, not bodies** — it adds no health the
audit arithmetic can see, it delays damage the board was already going to
do. Priced at 3 because one unit kind carries the swarm's force fields, so
a board that can break one is inconvenienced rather than beaten; rolled
beside Shield Towers it is worth considerably more, which is what a big
budget is *for*. **Maelstrom plays under it always** (see intrinsic rules
above).

**Shield Towers — 4 points.** Every so often a 3×3 shield tower rises somewhere
on the map (25 s for the first, one attempt every 45 s after, at most three
standing) and stands a **red force dome** over the ground around it: the
player's projectiles crossing the dome are absorbed into its shield pool,
so enemies under it are safe from projectile fire until the pool breaks —
and the dome **reforms whole** four seconds after the last hit on either
pool — not by degrees, because a dome at 12% is not a weaker obstacle, it is
one more volley. Any hit restarts that clock, so sustained fire holds a
shield tower open and looking away for four seconds means paying for the dome
again.
Only with the dome down can the body be hurt, and a destroyed shield tower is
**gone for good**; the timer raises the next elsewhere. From **wave 35** every new shield tower rises as a **mega shield tower**: five times
both pools and a dome sixteen tiles across, wider than most turrets reach
from one emplacement, so a whole section of the board has to be pointed at
it rather than whatever happened to be idle. Both pools ride the run's
shield multiplier — five times these numbers under Overshields, exactly
these numbers otherwise — and the **body is four times the dome** — a structure that died quickly would
never give the regen a chance to matter, since every hit on either pool
restarts the delay. Sustained fire holds a dome suppressed and grinds the
body down; break off for a wave and you come back to a dome to break twice.
The dome draws as **a carrier's bubble with the diagonals switched off**
(`SHIELD_PLAIN`) — same rim, same flat interior wash, no travelling hatch,
because a dome sits over a lane full of units and Mindustry's diagonals
laid across them read as damage. It is also filled as ONE disc sprite
rather than through `fillPoly`, which fans any non-hexagon into `sides`
textured triangles whose shared slopes double-blend into radial creases.
Instant weapons — lancer, arc, fuse, foreshadow, meltdown's beam — are not
absorbed (exactly as unit force fields never absorb them), which quietly
makes the beam roster the shield tower-breaking roster.

Where it lands is part of the rule. A shield tower's footprint blocks open lane
(the swarm routes around it; the spot roller refuses anything that would
seal the last route, cork a drop zone, or sit on water) — and one that
lands over towers **entombs** them: a buried turret is disabled and
untouchable, never destroyed, and stands back up the moment the shield tower
dies. Turrets chew shieldTowers **only when idle** — a turret with nothing else
in range spends its reload on one, so clearing a shield tower costs time between
waves, never mid-wave DPS. The player can **tap** a shield tower — or any enemy
— to focus it: every turret in range drops what it was doing for the
marked target, which wears a bobbing red arrow. Spending mid-wave DPS on a
dome is a choice with a price, and that choice is the whole game of the
rule.

**Hungry — 4 points.** One spawn in twenty walks in hungry (tinted pink,
and it never spreads: nothing in the game applies the status). Once a
second it reaches four tiles for a random neighbour that is not itself
hungry, not a boss, and on its own movement layer, and swallows it: the
meal is removed, the eater takes **double the meal's full health** onto
both its current and its maximum pool, and it draws 5% bigger. Twenty
meals is the ceiling — forty-one times the health it spawned with, at
double size.

Nothing else crosses over. Not shields, force fields, repair or shield
auras, burning, wet, armour or speed — a dagger that eats a quasar is a
very fat dagger. The **hitbox never moves either**: `urad` is what
physics, splash and every targeting scan read, and the swelling is art
(`Renderer.beginScale`, one pivot applied to every part of a unit's
assembly as it goes into the batch).

And **the eating is a tax on salvage**. A devoured body is removed without
ever being killed, so it never touches `killsByKind` and pays no drop at
all, while the unit that ate it still drops exactly what its own kind
drops. Twenty meals cost twenty bodies' worth of salvage and hand back
one.

**Armored Swarms — 4 points.** Every unit of **tier 3 or below** spawns
with **+10 flat armour**; tier 4 and 5 take none, because a fortress and a
zenith already carry the plating that matters and hardening them further
would only make the run longer. Armour is a flat shave floored at a tenth
of the raw hit, so the rule is **regressive by calibre** on purpose: +10 is
nothing to a lancer's 140 and ×1.55 effective health against a salvo's 28,
but it floors a duo's 9 and a scatter pellet's 3 outright — those guns land
a tenth of what they print and no more. So it does not say "the swarm is
tougher", it says **"the cheap guns stop counting"**, and the answer to it
is calibre: bigger emplacements, and an anti-air line that is not built out
of pellets. It is priced as Heavy rather than Brutal because that answer
exists and is affordable — but rolled early, before the tree has anything
with weight behind it, it is the harshest 4 in the catalog.

This was the ladder's own **swarm armour** column until it became a rule
nobody chose (see above); ten is the old top-rung value, kept whole.

**Speedy — 5 points.** Every enemy walks in at **double speed** and
**cannot be slowed**. Two halves of one rule, because either alone has an
answer: doubled speed is answered by a liquid turret, and slow immunity is
answered by not building one. It adds no health at all — it halves the
time every emplacement on the board has to spend its damage in, which is
why it is the dearest thing in the catalog and why the audit arithmetic,
which counts bodies and health, sees nothing.

The immunity is to the **slow**, not to the status: a soaked unit is still
soaked, still tinted, still puts out a fire it is carrying, still takes
whatever the ammunition does (`Sim.applyWet` holds the soak at a
multiplier of 1). The speed is applied once at spawn, as a stat, so every
reader of `uspd` — the drive, the chassis turn rate, the leg cycle — is
already looking at the speed the unit really travels at.

### Authoring waves

Wave order is no longer a gate of any kind — every rung sends every wave, so
a wave's position only says how deep into the run it lands — but it says
which STAGE it lands in, and a stage is priced (see *Three stages, three
tiers*). Three things to hold in mind:

- **Armour is a permanent multiplier.** `max(dmg - armor, 0.1 * dmg)`, so
  a fortress costs a duo line ten times its printed health on every rung.
  A unit must not debut before the player can afford a turret
  out-damaging its armour. (Two exceptions to keep in mind: burning
  pierces armour entirely, and the lancer counts armour quadruple.)
- **Health per body is difficulty that pays back by tier, not by health.**
  A kill drops its tier's scrap whatever the body's health, so a wave of
  tier-3 bodies pays eight a head however hard they were. Padding a wave
  with tier-1 bodies is nearly free — cost and income rise together —
  which is why swarm waves can be as big as they look good.
- **A stage's income is its tier's budget.** Move heavy bodies earlier
  and stage 1 pays for tier-2 turrets; thin stage 3 and nobody fields a
  spectre. `check()` reports a stage that buys too few or too many of its
  tier (`STAGE_BOARDS`).

Two more the arithmetic can't see: **air** (hail, scorch, arc, lancer and
ripple cannot shoot up at all) and **crawler speed** (twice the line's pace,
so they arrive before the kill zone is done with them).

And one the map decides: **naval waves need water**. The ten hulls travel
the water layer — deep water is a road to them and a wall to everything
else, shallow water is shared with walkers — so a wave asking for rissos
sends nothing at all on a map with no water zones. Ships also carry
Mindustry's automatic naval wet-immunity, which makes wave and tsunami
useless against them; only the bryde (shield field) and the aegires (a
22.5-tile heal field, the widest support field in the game) bring an
ability across.

Check any edit from the console — dev builds also warn on load:

```js
__ladder.check()      // complaints; empty means the script is in line
__ladder.audit()      // per-rung waves, units, health, XP
__ladder.stages()     // the three stages against their tiers
__ladder.grind()      // the stage table and the XP ladder, printed
__ladder.wave(7, 2)   // what one authored wave weighs and pays
```

### Economy

- **Scrap prices are authored per turret** (`TOWER_PRICE` in
  `economy.ts`) against the stage income above, and bent from the balance
  dashboard (`scrapPriceOf` reads an override layer, saved under `prices`
  in `public/balance.json`). Within a tier the order follows Mindustry's
  build costs; the size is what the stage pays.
- **The XP bonus is linear** (`XP_STEP_PER_RUNG`, +30% a rung), because
  the fight no longer compounds: a compounding payout against flat health
  would make the top rung the only one worth playing.
- **Nothing in the run is free.** Sandbox and the editors (`tech` null on
  the sim) build for nothing and show no scrap; every campaign run is
  charged. There is no saved board any more — a board is bought from the
  opening stipend outward, every run.
- **The level curve** is `XP_LEVEL_BASE × level^XP_LEVEL_POWER` to the
  next level (15,000 × n^1.35). A full rung-1 clear pays about 245,000 XP
  in kills plus the first-clear bonus and lands around level 5; a wipe at
  the end of stage 1 lands level 2.
