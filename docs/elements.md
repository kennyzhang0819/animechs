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

### Who carries it

Four turrets, and each lights a different shape of board:

| | how it lands | stacks |
|---|---|---|
| **torch** | a pierced line at 60px — the gun whose whole job is fire | 2 a hit |
| **deluge** | its odd nozzle, one ball in two, over a 40px pool | 2 a burst |
| **furnace** | everything under a held beam, re-timed every damage interval | 3 a tick |
| **airburst** | **one flak shell in five** (`altChance`), over its burst | 1 a burst |

Airburst is the odd one: its fire is a ROLL, not a property of the gun. It
throws two shells a volley six times a second, and a blast carries its
round's status (`Sim.splash`), so an always-incendiary flak would hold
everything it could see at the stack cap — for 180 scrap, at tier 1, on both
layers. The incendiary round is a whole second ammo
(`BulletStats.alt`), drawn in pyratite's orange, so the player can see which
shells are the ones that light. The dial to move is the chance: one stack is
already the floor of `burn`, and doubling it doubles the whole gun's fire.

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

### Who carries it

**The toxin line**, and nothing else. Four authored turrets — no Serpulo block
throws poison — one in each tier, sharing one green (`PAL.toxinFront/Back`,
the `toxin` accent in `turretArt.ts`) and one job, so a board that wants rot
buys the line rather than a gun:

| | tier | how it lands | poison |
|---|---|---|---|
| **duster** | 1x1 | a gas dart at 285 units — the longest reach on the board bar tether, barrage and railhead — bursting over 22 units | 1.2 a burst, one burst every 1.4s |
| **blighter** | 2x2 | an arcing canister, 34-unit blast — the widest on the board | 1.4 a burst, on everything in it |
| **drifter** | 3x3 | **a field that does not land**: a 21-tile disc of gas walking 450 units downrange over fourteen seconds, one canister every sixteen | 1 a pulse, 2 a second under it |
| **stinger** | 4x4 | needles, twelve a second, one body at a time | 1.6 a hit — 19 a second of ramp |

The line's shape is the channel's: **nothing here is burst**. A duster's bolt
does 9 over its whole burst, a drifter's pulse 6, and every one of the four is a rounding error
against the crowd it is shooting at until the rot it has laid is doing the
killing. Against an `ironhide5` a stinger's 30-damage needle is shaved to 3 by
30 points of armour; twenty seconds of holding it there is 380 a second of
poison the armour never sees.

The autocannon carried 1.5 a hit until the line arrived and it came off — a
generalist that also out-poisoned the guns built for it left the line with
nothing of its own.

**The blast and the cloud both poison flat.** `Sim.splash` falls damage off with
distance and does *not* fall the poison off with it: a body at the rim of a
blighter's canister takes the same rot as one at the centre, because a cloud is
not a shockwave. A round that bursts therefore lays its poison ONCE, in the
blast: the direct-hit path skips `b.poison` whenever the shot has splash
(`Sim.updateProjectiles`), or whatever it hit on the way in would be rotted
twice.

**The drifter is a field, and it is drawn as one.** The cloud in flight is
filled into the same buffer a force projector's dome is
(`Renderer.drawCloudFields`), so what the player sees is a volume of lit ground
with a rim round it rather than a shot — and since the field is the whole
weapon, the turret throws one every sixteen seconds against a field that lives
fourteen. One drifter is one moving no-go zone, and a second one is a second.

**One round, three guns.** Duster's dart, blighter's lob and the cylinder
tumbling in the middle of the drifter's field are one sprite pair at three
sizes (`atlas.ts` `canisterBullet`), the way every bullet-class turret from the
tacker to the repeater shares `bullet`. The stinger is a bullet-class gun and
shares that one, in the line's green.

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

- **Poison has no cap by design, and the stinger is the gun that proves it.**
  Twelve hits a second at 1.6 is 19 a second of ramp with no ceiling: 190 by ten
  seconds on one body, 380 by twenty, past everything else the 4x4 band does by
  a minute. What holds it in is that the ramp is PER BODY and dies with it — the
  gun is terrible at a queue and unbounded against the one thing that will not
  fall over. `POISON_SECONDS` is the only other brake. If it proves too strong
  the lever is the 1.6, then a cap.
- **Soak never expiring means it only ever goes up.** Every body that survives a
  douser is permanently closer to breaking down. The balance lever is the `soak`
  per hit on the ammo, not a duration.
- **A second ammo is a whole second bullet.** Deluge's odd barrel loads
  `bullet.alt` — fire, drawn as an orange orb; the even one water, drawn blue.
  Airburst rolls for its instead (`altChance`). Either way the alt has
  to be threaded through every `bulletFor(kind, frag, alt)` call or the shot is
  drawn *and read* as the main ammo; `Game.remakeView` dropped the argument once
  and the fire nozzle spent that time throwing blue water balls. An upgrade
  that moves a plain number has to move both (`eachAmmo` in `upgrades.ts`), or
  a modded gun fires one upgraded round and one stock one.

## Cost

The status pass already walked every body for burn and wet, so poison and the
soak check are a compare-and-skip on bodies that have neither. The one genuinely
new cost is fire's spread: a bucket walk per burning body, clocked by
`FIRE_SPREAD_STRIDE` and bounded by contact (`FIRE_SPREAD_GAP`). Both land in
`Sim.probes`, which the profiler reads.
