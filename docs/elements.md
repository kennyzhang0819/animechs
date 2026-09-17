# The three elements

Fire, poison and water are the game's three status channels. All three damage
**through plating** — `damageUnit(..., pierceArmor = true, ...)` — which is the
point of them: a T5 hull behind 22 points of armour out-arithmetics any stack of
"+10% damage", and these do not care what it is wearing. A shield still soaks
them.

Each is a different *shape* of answer, not three sizes of the same one:

| | Damage | Stacks by | Falls off | Gimmick |
|---|---|---|---|---|
| **Fire** | Low | Stacks, capped at `FIRE_MAX_STACKS` | One shared timer | **Spreads** to nearby bodies |
| **Poison** | High | Rate adds, **no cap** | One shared timer | Consecutive hits compound |
| **Water** | None | Soak adds, **no cap** | **Never** (the slow does) | Execute under a threshold |

Tuning lives in `constants.ts`; the tick is `Sim.updateStatus`.

## Fire — crowd control

`bullet.burn` is **stacks added per hit**, not seconds. A body burns for
`FIRE_DPS_PER_STACK × stacks`, and every hit also resets one shared timer
(`FIRE_SECONDS`). Stop hitting and the whole stack expires together.

What makes fire fire is that it **spreads on contact**. A burning body rolls
`FIRE_SPREAD_CHANCE` to hand one stack to another body it is *touching* —
centre-to-centre within `radiusA + radiusB + FIRE_SPREAD_GAP`, and nothing
further. Not a fixed radius: a body standing alone has nothing to give fire to,
and that is the whole reason fire is a crowd weapon.

The roll is staggered by body index (`(statusFrame + i) % FIRE_SPREAD_STRIDE`)
so a burning crowd never all walks the spatial hash on the same tick — without
that stagger this is the most expensive thing in the status pass. The target is
picked by reservoir sampling in a single pass, skipping bodies already at the
stack cap and respecting `KIND_BURN_IMMUNE`.

### Why fire is weak against one big hull

There is **no tier check anywhere**. Fire does flat damage a second, and the
roster's health curve does the rest — T3 to T4 is an eight-fold jump, so the
same 60 dps that deletes a lane of T1s is noise against a single T4:

| | hp | seconds to burn down at full stack |
|---|---|---|
| stoop1 (T1) | 70 | 1.2s |
| ironhide1 (T1) | 150 | 2.5s |
| ironhide2 (T2) | 550 | 9.2s |
| ironhide3 (T3) | 900 | 15s |
| ironhide4 (T4) | 9,000 | 150s |
| ironhide5 (T5) | 24,000 | 400s |

Contact spread is the second half of the same argument. Measured on a packed
crowd: 40 T1s inside 45px light **32 of 40**; the same 40 scattered over 400px
light **1**; a lone T5 lights **1**. Big bodies are pushed apart by their own
collision radii, so they rarely touch — and even when they do, 60 dps against
20k health is nothing.

So fire's two levers both point the same way, and neither of them asks what tier
anything is.

## Poison — the punishing one

`bullet.poison` is **damage a second added per hit**. It adds and never caps: a
body on 10 poison hit for 20 more is taking 30 a second, immediately. Each hit
resets the shared `POISON_SECONDS` timer, so sustained fire on one target
compounds hard and a target you walk away from drops it all at once.

No spread, no cap, highest damage. This is the anti-heavy channel.

**The autocannon carries it** — a plain projectile with no splash, so poison
stays single-target, and 8.3 hits a second so sustained focus ramps hard. Against
an `ironhide5` its 28-damage rounds are shaved to 2.8 by 30 points of armour (23
dps); four seconds of focus builds 50 dps of poison that the armour does not
touch. Against trash the gun already deletes, poison contributes nothing. That
is the whole identity: poison is what the autocannon reaches for when plating
has made its own rounds pointless.

## Water — slow now, execute later

`bullet.wet` carries three numbers: `soak`, `slow` and `duration`.

**Soak accumulates and never expires.** It is a raw health threshold: the moment
a body's health falls under its accumulated soak, it breaks down. Water deals no
damage of its own — it makes everything *else* lethal sooner.

**The slow is separate and does expire.** `duration` seconds of driving at
`slow`, strongest slow in force. A body can be well past its soak threshold and
no longer wet at all; the threshold still stands.

Soaked bodies also take `WET_SHOCK_MUL` from electric shots, and that half rides
the slow, not the soak — it only applies while wet.

**Ships take the soak and shrug off the slow.** All ten naval kinds declare wet
immunity (`KIND_WET_IMMUNE`), and that immunity gates the slow only — a hull is
already in the water, but soak still builds on it and still breaks it down under
the threshold. The same split covers the SPEEDY mutator. Before this the
immunity refused the whole status, so a douser soaking a boat did nothing at
all.

The threshold is **flat health**, so water is lethal against a lane of trash and
irrelevant against a 20k-hull or a boss. That asymmetry is the identity: water
clears crowds, poison kills heavies, fire connects them.

## What changed, and what to watch

Fire and water used to **cancel** — applying fire burned off soak, applying
water put out fire. That rule is gone; all three stack freely and a
water-plus-fire board is now a build rather than a mistake.

Two things to keep an eye on:

- **Poison has no cap by design, and it is already on a fast gun.** The
  autocannon lands 8.3 hits a second, so held on one body its poison climbs
  without limit — 50 dps by four seconds, 100 by eight. The `POISON_SECONDS`
  timer is the only thing holding it back today. If it proves too strong the
  lever is the per-hit 1.5, or a cap.
- **Soak never expiring means it only ever goes up.** Every body that survives a
  douser is permanently closer to breaking down. The balance lever is the `soak`
  per hit on the ammo, not a duration.
- **The deluge's two nozzles are two ammos.** The odd barrel loads `bullet.alt`
  — fire, drawn as an orange orb; the even one water, drawn blue. That alt has
  to be threaded through every `bulletFor(kind, frag, alt)` call or the shot is
  drawn *and read* as the main ammo; `Game.remakeView` dropped the argument once
  and the fire nozzle spent that time throwing blue water balls.

## Cost

The status pass already walked every body for burn and wet, so poison and the
soak check are a compare-and-skip on bodies that have neither. The one genuinely
new cost is fire's spread: a bucket walk per burning body, clocked by
`FIRE_SPREAD_STRIDE` and bounded by contact (`FIRE_SPREAD_GAP`). Both land in
`Sim.probes`, which the profiler reads.
