# `npm run check:full` — 2026-09-16

Handoff for perf work. Everything below is one run, no edits to the tree.

## Read this first — three caveats

1. **CPU ONLY. No GPU work was measured.** The `render` stage is the only
   part of the suite that touches a GPU, and **it did not run**. It shells
   out to `scripts/bench.mjs`, which does `import { chromium } from
   "playwright"` — and `playwright` is declared in `devDependencies` but is
   **not installed** in `node_modules` (38 packages there, no `playwright`,
   no `playwright-core`, and no browser cache at
   `~/Library/Caches/ms-playwright`). It failed with `ERR_MODULE_NOT_FOUND`
   before launching a browser. So: every millisecond in this report is
   single-threaded sim on the CPU. The draw half of the frame is unmeasured
   and unknown.

   To measure it: `npm install && npx playwright install chromium`
   (~150MB download), then `npm run check:full -- --only render`. That will
   ADD to the 197s below, not fit inside it.

2. **Total wall time: 197.2 seconds (3m 17s).** Exit code 1. Measured twice
   and agreeing: the script's own `BROKEN in 197.2s` line, and an external
   `date`-delta of 197s around the `npm run check:full` process.
   `transpile cached` — `game/*.ts` was already built into `.playtest/check`
   and no source was newer, so a cold run costs more. `compile 1.2s` is the
   `tsc` stage; `npx tsc --noEmit` was re-run standalone to confirm it
   genuinely executes and is genuinely that fast (1.35s wall, no output,
   clean exit) rather than silently no-op'ing into a false `ok`.

   CLAUDE.md warns `check:full` can take ~10 minutes. That is a warning about
   the suite another agent is still expanding, not a measurement of this
   tree. On this machine, at this commit, the CPU half is 3m 17s.

3. **Machine:** Apple M3 Pro, 12 CPU cores, 18 GPU cores, 18GB. macOS
   (Darwin 25.6.0), Node v24.9.0. Commit `9c1f737`. The tree was clean when
   the run started. It is now one line dirty in `tsconfig.json` — a `next dev`
   server on port 4009, running in some other session, appended
   `.next-4009/types/**/*.ts` to `include` while this ran. Unrelated to the
   run and to any of the numbers here; `include` already carries `**/*.ts`,
   so coverage did not change either way.

   For the record, the `types` stage is real coverage, not a narrow glob:
   `tsc --noEmit --listFiles` reports 155 first-party `.ts`/`.tsx` files
   checked, `game/sim.ts` and the rest of `game/` among them. It runs in
   1.35s because `compilerOptions.incremental` is on and the
   `.tsbuildinfo` was warm.

## What failed

Four stages. Budget is **11.7ms a step** (one step's share of a 60fps frame).

| stage | result |
| --- | --- |
| `turrets` | FAIL — 2 of 17 kinds over |
| `enemies` | FAIL — 14 of 51 kinds over |
| `swarmfirst` | FAIL — 20.7ms (p95 23.3) |
| `render` | FAIL — did not run, see caveat 1 |

Eleven stages passed: `types`, `art`, `atlas`, `cells`, `docs`, `worlds`,
`sim`, `frames`, `siege`, `scale`, `maps`, `upgrades`.

### Every kind over budget, worst first

`enemies` — 10,000 of one kind on Coldline, each in reach of a core that
cannot fall:

| kind | ms/step | of 11.7 | hot phase |
| --- | --- | --- | --- |
| `livewire4` | **71.5** (p95 125.9) | 6.1x | `unitGuns` 66.0ms |
| `livewire2` | 29.0 (p95 33.1) | 2.5x | `unitGuns` 23.8ms |
| `starhart2` | 24.6 (p95 27.4) | 2.1x | `unitGuns` 19.0ms |
| `starhart4` | 19.9 (p95 24.8) | 1.7x | `unitGuns` 11.6ms |
| `ironhide4` | 16.7 (p95 20.3) | 1.4x | `units` 4.6 · `unitGuns` 4.6ms |
| `mixed` | 16.2 (p95 18.7) | 1.4x | `unitGuns` 7.1ms |
| `livewire1` | 16.0 (p95 18.9) | 1.4x | `unitGuns` 10.6ms |
| `livewire3` | 15.0 (p95 17.8) | 1.3x | `unitGuns` 9.3ms |
| `ironhide5` | 14.7 (p95 17.1) | 1.3x | `units` 5.0ms |
| `starhart1` | 13.8 (p95 15.6) | 1.2x | `unitGuns` 9.5ms |
| `dartback4` | 12.8 (p95 14.2) | 1.1x | `units` 4.3ms |
| `tusker4` | 12.7 (p95 13.7) | 1.1x | `units` 5.5ms |
| `starhart3` | 12.2 (p95 14.2) | 1.0x | `unitGuns` 7.2ms |
| `dartback5` | 11.8 (p95 12.7) | 1.0x | `units` 4.4ms |

`turrets` — 10,000 of one kind on Coldline, each in reach of one body that
cannot die:

| kind | ms/step | of 11.7 | hot phase |
| --- | --- | --- | --- |
| `whirl` | 19.3 (p95 22.5) | 1.6x | `projectiles` 16.4ms (89%) — 140,970 shots in flight |
| `hive` | 18.0 (p95 18.7) | 1.5x | `projectiles` 14.9ms (86%) — 78,700 shots in flight |

### Two patterns worth starting from

- **`unitGuns` owns the enemy failures.** Every one of the worst five is
  `unitGuns`-dominated, and the two families at the top — `livewire`
  (navalSupport) and `starhart` (support) — are the support trees.
  `livewire4` alone spends 66.0 of its 71.5ms there, with a p95 of 125.9ms
  meaning the bad steps are more than ten frames long. That single kind is
  the largest number in the whole report by a factor of two and a half.
- **`projectiles` owns the turret failures**, and the suite already knows
  it: `scripts/check.mjs:957` sets `SIEGE_LENIENT_MS = 25`, and the `scale`
  and `maps` stages print *"held to 25ms until projectiles is fixed"*. Those
  two stages pass only because of that lenience — at the real 11.7ms budget,
  `maps` Confluence (10.9) and `scale` 12k (8.3) are much closer to the line
  than the `ok` suggests. `hive` and `whirl` are the same phase failing
  where there is no lenience.

## Reproducing one clock

```
npm run check:full -- --only enemies --kinds livewire4 --n 10000
npm run check:full -- --only turrets --kinds hive,whirl --n 10000
npm run check:full -- --only swarmfirst
```

## The full log, verbatim

```
started 18:25:51

> animechs@0.1.0 check:full
> node scripts/check.mjs --full

  turrets    tacker: 10000 stood, 6.1ms a step (p95 6.3) — 1 bodies, 34,448 shots in flight, 1248 fx; projectiles 4.1ms
  turrets    lobber: 10000 stood, 2.8ms a step (p95 3.3) — 1 bodies, 28,820 shots in flight, 1344 fx; towers 1.6ms
  turrets    autocannon: 10000 stood, 10.9ms a step (p95 11.1) — 1 bodies, 71,753 shots in flight, 1269 fx; projectiles 8.5ms
  turrets    airburst: 10000 stood, 10.1ms a step (p95 10.4) — 1 bodies, 60,616 shots in flight, 1356 fx; projectiles 7.9ms
  turrets    cleaver: 9425 stood, 1.4ms a step (p95 1.6) — 1 bodies, 0 shots in flight, 4363 fx; towers 1.3ms
  turrets    torch: 10000 stood, 5.8ms a step (p95 6.1) — 1 bodies, 30,000 shots in flight, 1348 fx; projectiles 3.8ms
  turrets    coil: 10000 stood, 1.6ms a step (p95 2.0) — 1 bodies, 0 shots in flight, 1646 fx; towers 1.5ms
  turrets    piercer: 10000 stood, 1.2ms a step (p95 1.3) — 1 bodies, 0 shots in flight, 4219 fx; towers 1.1ms
  turrets    barrage: 9425 stood, 3.7ms a step (p95 5.7) — 1 bodies, 72,724 shots in flight, 1279 fx; projectiles 2.6ms
  turrets    douser: 10000 stood, 2.8ms a step (p95 3.1) — 1 bodies, 6,935 shots in flight, 1357 fx; towers 1.7ms
  turrets    tether: 10000 stood, 1.2ms a step (p95 1.5) — 1 bodies, 0 shots in flight, 1 fx; towers 1.1ms
  turrets    deluge: 9425 stood, 9.9ms a step (p95 10.6) — 1 bodies, 59,937 shots in flight, 1400 fx; projectiles 7.7ms
  turrets    hive: 10000 stood, 18.0ms a step (p95 18.7) — 1 bodies, 78,700 shots in flight, 1328 fx; projectiles 14.9ms
  turrets    whirl: 9425 stood, 19.3ms a step (p95 22.5) — 1 bodies, 140,970 shots in flight, 1299 fx; projectiles 16.4ms
  turrets    repeater: 4947 stood, 4.0ms a step (p95 4.0) — 1 bodies, 23,935 shots in flight, 1292 fx; projectiles 2.8ms
  turrets    furnace: 4947 stood, 0.9ms a step (p95 1.0) — 1 bodies, 0 shots in flight, 246 fx; towers 0.8ms
  turrets    railhead: 4947 stood, 0.7ms a step (p95 0.7) — 1 bodies, 0 shots in flight, 3 fx; towers 0.5ms
  enemies    ironhide1: 10000 stood, 7.8ms a step (p95 8.3) — 10,000 bodies, 0 shots in flight, 3816 fx; unitGuns 3.6ms
  enemies    ironhide2: 10000 stood, 10.7ms a step (p95 12.5) — 10,000 bodies, 54,828 shots in flight, 1400 fx; unitGuns 4.1ms
  enemies    ironhide3: 10000 stood, 9.2ms a step (p95 10.8) — 10,000 bodies, 12,768 shots in flight, 1227 fx; unitGuns 3.5ms
  enemies    ironhide4: 10000 stood, 16.7ms a step (p95 20.3) — 10,000 bodies, 130,948 shots in flight, 1350 fx; units 4.6ms
  enemies    ironhide5: 10000 stood, 14.7ms a step (p95 17.1) — 9,441 bodies, 17,454 shots in flight, 1350 fx; units 5.0ms
  enemies    dartback1: 10000 stood, 8.9ms a step (p95 10.2) — 9,971 bodies, 840 shots in flight, 1297 fx; unitGuns 4.0ms
  enemies    dartback2: 10000 stood, 11.4ms a step (p95 12.5) — 9,999 bodies, 3,922 shots in flight, 1268 fx; units 4.3ms
  enemies    dartback3: 10000 stood, 11.2ms a step (p95 12.3) — 9,996 bodies, 3,356 shots in flight, 1319 fx; units 4.3ms
  enemies    dartback4: 10000 stood, 12.8ms a step (p95 14.2) — 9,989 bodies, 19,690 shots in flight, 1362 fx; units 4.3ms
  enemies    dartback5: 10000 stood, 11.8ms a step (p95 12.7) — 9,929 bodies, 18,855 shots in flight, 1304 fx; units 4.4ms
  enemies    starhart1: 10000 stood, 13.8ms a step (p95 15.6) — 10,000 bodies, 0 shots in flight, 3947 fx; unitGuns 9.5ms
  enemies    starhart2: 10000 stood, 24.6ms a step (p95 27.4) — 9,997 bodies, 0 shots in flight, 4370 fx; unitGuns 19.0ms
  enemies    starhart3: 10000 stood, 12.2ms a step (p95 14.2) — 10,000 bodies, 0 shots in flight, 4095 fx; unitGuns 7.2ms
  enemies    starhart4: 10000 stood, 19.9ms a step (p95 24.8) — 9,411 bodies, 0 shots in flight, 1393 fx; unitGuns 11.6ms
  enemies    starhart5: 10000 stood, 10.2ms a step (p95 11.2) — 7,097 bodies, 0 shots in flight, 1369 fx; units 3.6ms
  enemies    stoop1: 10000 stood, 7.5ms a step (p95 8.1) — 9,869 bodies, 0 shots in flight, 50 fx; unitGuns 3.9ms
  enemies    stoop2: 10000 stood, 7.7ms a step (p95 8.2) — 9,921 bodies, 0 shots in flight, 27 fx; unitGuns 3.7ms
  enemies    stoop3: 10000 stood, 7.8ms a step (p95 8.2) — 9,938 bodies, 0 shots in flight, 26 fx; unitGuns 3.7ms
  enemies    stoop4: 10000 stood, 8.6ms a step (p95 9.4) — 8,478 bodies, 110 shots in flight, 1096 fx; unitGuns 3.5ms
  enemies    stoop5: 10000 stood, 5.6ms a step (p95 7.9) — 5,357 bodies, 25 shots in flight, 53 fx; unitGuns 2.4ms
  enemies    skate1: 10000 stood, 8.0ms a step (p95 8.6) — 10,000 bodies, 0 shots in flight, 1660 fx; unitGuns 3.7ms
  enemies    skate2: 10000 stood, 8.5ms a step (p95 9.1) — 10,000 bodies, 0 shots in flight, 4108 fx; unitGuns 3.7ms
  enemies    skate3: 10000 stood, 8.8ms a step (p95 9.4) — 10,000 bodies, 0 shots in flight, 2843 fx; unitGuns 3.8ms
  enemies    skate4: 10000 stood, 8.1ms a step (p95 8.9) — 7,468 bodies, 0 shots in flight, 4130 fx; unitGuns 3.0ms
  enemies    skate5: 10000 stood, 10.0ms a step (p95 14.7) — 4,948 bodies, 0 shots in flight, 1364 fx; physics 3.9ms
  enemies    livewire1: 10000 stood, 16.0ms a step (p95 18.9) — 10,000 bodies, 0 shots in flight, 4220 fx; unitGuns 10.6ms
  enemies    livewire2: 10000 stood, 29.0ms a step (p95 33.1) — 10,000 bodies, 0 shots in flight, 4217 fx; unitGuns 23.8ms
  enemies    livewire3: 10000 stood, 15.0ms a step (p95 17.8) — 9,998 bodies, 0 shots in flight, 4080 fx; unitGuns 9.3ms
  enemies    livewire4: 10000 stood, 71.5ms a step (p95 125.9) — 5,979 bodies, 0 shots in flight, 1760 fx; unitGuns 66.0ms
  enemies    livewire5: 10000 stood, 10.9ms a step (p95 15.9) — 4,796 bodies, 0 shots in flight, 2512 fx; unitGuns 4.4ms
  enemies    tusker1: 10000 stood, 10.3ms a step (p95 10.8) — 10,000 bodies, 0 shots in flight, 1392 fx; unitGuns 3.8ms
  enemies    tusker2: 10000 stood, 10.3ms a step (p95 11.1) — 10,000 bodies, 0 shots in flight, 1392 fx; units 3.8ms
  enemies    tusker3: 10000 stood, 11.2ms a step (p95 11.8) — 9,999 bodies, 0 shots in flight, 1387 fx; units 3.8ms
  enemies    tusker4: 10000 stood, 12.7ms a step (p95 13.7) — 7,900 bodies, 0 shots in flight, 1362 fx; units 5.5ms
  enemies    tusker5: 10000 stood, 8.9ms a step (p95 12.7) — 4,985 bodies, 0 shots in flight, 1273 fx; units 4.1ms
  enemies    boss: 100 stood, 0.2ms a step (p95 0.3) — 100 bodies, 171 shots in flight, 1380 fx; hash 0.1ms
  enemies    grapnel1: 10000 stood, 1.0ms a step (p95 1.6) — 1,955 bodies, 0 shots in flight, 44 fx; units 0.5ms
  enemies    grapnel2: 10000 stood, 0.9ms a step (p95 1.6) — 1,832 bodies, 0 shots in flight, 50 fx; units 0.5ms
  enemies    grapnel3: 10000 stood, 0.9ms a step (p95 1.7) — 1,765 bodies, 0 shots in flight, 26 fx; units 0.5ms
  enemies    grapnel4: 10000 stood, 0.9ms a step (p95 1.7) — 1,612 bodies, 0 shots in flight, 25 fx; units 0.5ms
  enemies    grapnel5: 10000 stood, 0.8ms a step (p95 2.0) — 1,503 bodies, 0 shots in flight, 19 fx; units 0.4ms
  enemies    kettle1: 10000 stood, 8.7ms a step (p95 9.6) — 10,000 bodies, 0 shots in flight, 3603 fx; unitGuns 4.7ms
  enemies    kettle2: 10000 stood, 8.8ms a step (p95 10.2) — 10,000 bodies, 0 shots in flight, 2894 fx; unitGuns 4.5ms
  enemies    kettle3: 10000 stood, 9.9ms a step (p95 10.8) — 10,000 bodies, 0 shots in flight, 3895 fx; unitGuns 4.7ms
  enemies    kettle4: 10000 stood, 9.5ms a step (p95 11.4) — 9,727 bodies, 0 shots in flight, 3270 fx; unitGuns 4.4ms
  enemies    kettle5: 10000 stood, 6.6ms a step (p95 7.5) — 6,173 bodies, 0 shots in flight, 2653 fx; unitGuns 2.6ms
  enemies    wormhead: 10000 stood, 8.5ms a step (p95 13.0) — 8,954 bodies, 0 shots in flight, 45 fx; physics 5.7ms
  enemies    wormcar: 10000 stood, 9.4ms a step (p95 12.9) — 9,533 bodies, 0 shots in flight, 36 fx; physics 5.8ms
  enemies    wormtail: 10000 stood, 9.6ms a step (p95 17.5) — 9,533 bodies, 0 shots in flight, 36 fx; physics 6.4ms
  enemies    mixed: 10001 stood, 16.2ms a step (p95 18.7) — 9,883 bodies, 5,487 shots in flight, 3233 fx; unitGuns 7.1ms
  swarmfirst 10001 bodies first, then 18074 turrets down at 300 a step, 9922 standing, 38 kills — 20.7ms a step (p95 23.3) of 11.7
  upgrades   8984 turrets, 219 bodies (79 air, 8 T5 kinds, 15 bosses), 16 turrets lost, 9.4ms a step (least median of 3; mean 13.2, worst 28, 10% over the frame) against 11.7ms
ok   types   tsc --noEmit, 0 errors
ok   art     22 drawings
ok   atlas   475 static cells, 61.1% of 3584x4096, biggest free rect 3584x1088 (team cells are packed at runtime and are NOT counted — see this stage)
ok   cells   46 team cells
ok   docs    18 documents
ok   worlds  3 playable, finishable · 14 shelved, construct only
ok   sim     bodies at 3s, 12 turrets on the route, first hit 28s, 0 kills, 28s simulated
ok   frames  5280 bodies of 39 kinds, 1395 turrets, 8.5ms a step (p95 9.3ms) in a 11.7ms budget
ok   siege   8971 turrets, 223 bodies (80 air, 7 T5 kinds, 5 bosses), 29 turrets lost, 7.1ms a step (least median of 3; mean 8.6, worst 19, 0% over the frame) against 11.7ms
ok   scale   3k 4.8ms · 6k 6.1ms · 9k 5.8ms · 12k 8.3ms a step (held to 25ms until projectiles is fixed)
ok   maps    ms a step, held to 25 until projectiles is fixed — Coldline 6.2 · Thornway 7.1 · Confluence 10.9
FAIL turrets 10000 of one kind on Coldline, ms a step of 11.7 — tacker 6.1 · lobber 2.8 · autocannon 10.9 · airburst 10.1 · cleaver 1.4 · torch 5.8 · coil 1.6 · piercer 1.2 · barrage 3.7 · douser 2.8 · tether 1.2 · deluge 9.9 · hive 18.0 · whirl 19.3 · repeater 4.0 (4947 fit) · furnace 0.9 (4947 fit) · railhead 0.7 (4947 fit)
       hive: 18.0ms a step (p95 18.7) of 11.7 — 1 bodies, 78,700 shots in flight, 1328 fx; projectiles 14.9ms
           pad: widest live hitbox 0px air / 10px ground → each shot sweeps 9 hash cells (span 1)
           phase             ms   worst  share  slow ms   work (per step)
           projectiles    14.85    16.4    86%    15.71   hashcands 756 · bodies 75,004
                                         on slow steps:   hashcands 829 · bodies 79,101
       whirl: 19.3ms a step (p95 22.5) of 11.7 — 1 bodies, 140,970 shots in flight, 1299 fx; projectiles 16.4ms
           pad: widest live hitbox 0px air / 10px ground → each shot sweeps 9 hash cells (span 1)
           phase             ms   worst  share  slow ms   work (per step)
           projectiles    16.36    36.5    89%    17.73   hashcands 693 · bodies 129,458
                                         on slow steps:   hashcands 748 · bodies 140,269
FAIL enemies 10000 of one kind on Coldline, ms a step of 11.7 — ironhide1 7.8 · ironhide2 10.7 · ironhide3 9.2 · ironhide4 16.7 · ironhide5 14.7 · dartback1 8.9 · dartback2 11.4 · dartback3 11.2 · dartback4 12.8 · dartback5 11.8 · starhart1 13.8 · starhart2 24.6 · starhart3 12.2 · starhart4 19.9 · starhart5 10.2 · stoop1 7.5 · stoop2 7.7 · stoop3 7.8 · stoop4 8.6 · stoop5 5.6 · skate1 8.0 · skate2 8.5 · skate3 8.8 · skate4 8.1 · skate5 10.0 · livewire1 16.0 · livewire2 29.0 · livewire3 15.0 · livewire4 71.5 · livewire5 10.9 · tusker1 10.3 · tusker2 10.3 · tusker3 11.2 · tusker4 12.7 · tusker5 8.9 · boss 0.2 · grapnel1 1.0 · grapnel2 0.9 · grapnel3 0.9 · grapnel4 0.9 · grapnel5 0.8 · kettle1 8.7 · kettle2 8.8 · kettle3 9.9 · kettle4 9.5 · kettle5 6.6 · wormhead 8.5 · wormcar 9.4 · wormtail 9.6 · mixed 16.2
       ironhide4: 16.7ms a step (p95 20.3) of 11.7 — 10,000 bodies, 130,948 shots in flight, 1350 fx; units 4.6ms
           pad: widest live hitbox 0px air / 28px ground → each shot sweeps 9 hash cells (span 1)
           phase             ms   worst  share  slow ms   work (per step)
           units           4.62     8.3    27%     4.74   bodies 10,000
           unitGuns        4.59    14.9    27%     4.82   structcands 408 · bodies 10,000 · picks 408
       ironhide5: 14.7ms a step (p95 17.1) of 11.7 — 9,441 bodies, 17,454 shots in flight, 1350 fx; units 5.0ms
           pad: widest live hitbox 0px air / 38px ground → each shot sweeps 25 hash cells (span 2)
           phase             ms   worst  share  slow ms   work (per step)
           units           4.98     7.0    33%     5.26   bodies 9,585
                                         on slow steps:   bodies 9,552
       dartback4: 12.8ms a step (p95 14.2) of 11.7 — 9,989 bodies, 19,690 shots in flight, 1362 fx; units 4.3ms
           pad: widest live hitbox 0px air / 29px ground → each shot sweeps 9 hash cells (span 1)
       ...and 58 more
FAIL swarmfirst 10001 bodies first, then 18074 turrets down at 300 a step, 9922 standing, 38 kills — 20.7ms a step (p95 23.3) of 11.7
       a step with a card on it takes 20.7ms (p95 23.3) of 11.7
           pad: widest live hitbox 240px air / 73px ground → each shot sweeps 289 hash cells (span 8)
           phase             ms   worst  share  slow ms   work (per step)
           physics         4.27     4.5    25%     4.26   bodies 9,705
                                         on slow steps:   bodies 9,588
ok   upgrades 53 random upgrade nodes on — 8984 turrets, 219 bodies (79 air, 8 T5 kinds, 15 bosses), 16 turrets lost, 9.4ms a step (least median of 3; mean 13.2, worst 28, 10% over the frame) against 11.7ms
FAIL render  
       the bench did not report:     at ModuleLoader.getModuleJobForImport (node:internal/modules/esm/loader:317:38) /     at #link (node:internal/modules/esm/module_job:208:49) { /   code: 'ERR_MODULE_NOT_FOUND' / } /  / Node.js v24.9.0

BROKEN in 197.2s (transpile cached) — compile 1.2s
exit=1 elapsed=197s
```
