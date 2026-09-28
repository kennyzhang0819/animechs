# Heroes — the run played as one mech

An experiment beside the two modes, not a third one: on the deploy screen a
**Hero** row (any mode) names a hero or None. With one named, the run is the
same run — the rolled board, the ladder rung, the tide, the core, the run
clock's income — but the player is a body on the field, not a cursor over it.
`game/heroes.ts` is the roster, `game/herosim.ts` the mechanics, and the pick
rides the spec (`LevelSpec.hero`) so the sim on its worker builds the same
hero the page draws.

## The shape

Each hero is **one turret line**, made mobile. Its four turrets (keys 1-4) are
the line's tier 1 to 4 guns; its primary fires one of those guns' own ammo;
its skills are the line's other shapes thrown by hand. The hero is drawn as
the line's first turret head on a plate over a ring in the line's accent, so
the one legend the board already teaches (docs/turret-factions.md, one colour
an ammo) says which hero this is.

| hero | line | turrets | primary (LMB) | secondary (RMB) | move (Space) | ult (R) |
| --- | --- | --- | --- | --- | --- | --- |
| **Blight** | toxin | duster, blighter, drifter, stinger | stinger needle, 4/s | three blighter gas shells at the cursor | a dash venting poison along its path | three drifter clouds released toward the cursor |
| **Pyre** | flame | torch, airburst, cleaver, furnace | torch tongue, 10/s | a cleaver slash, 70° ahead | a burning dash | a furnace beam held on the aim for three seconds |
| **Arc** | beam | coil, piercer, tether, railhead | coil bolt chaining from the body nearest the cursor | a piercer beam through eight bodies | blink to the cursor, ten tiles | three railhead shots in a fan |
| **Gunner** | kinetic | tacker, autocannon, barrage, repeater | autocannon round, 9/s | three lobber shells | double speed for 2.5 s | twelve barrage shells over the cursor |

Every shot is the turret's: the primary and the projectile skills go down
`Sim.fireShot` through a **phantom turret** — a `Tower` built by `newTower`,
in no list, claiming no ground, moved onto the hero and pointed at the cursor
before each volley. So a needle is the stinger's needle, with the stinger's
poison, drawn as the stinger's shot, and the kind's live spec (skills,
relics) applies in flight. The instant skills (cleave, lance, rail) go the
same way with a spec written over — a longer beam, a wider cone. Only the
held furnace beam is its own loop (`channelUlt`): a `collideLine` sweep twelve
times a second with the furnace's damage and burn.

Measured standing against forty ironhide2 at nine tiles: the primaries land
450 to 930 damage a second, a cleave 7,300 across the crowd, a barrage 17,600.
A hero is not the board. It is what the board cannot do: be where the wave
is, and put the next turret down there.

## The body

The hero hovers: it walks over everything, clamped to the board, at 11 to
12.5 tiles a second, and a dash or a blink covers seven to ten tiles more.
**Enemies do not aim at it.** The swarm hunts structures
(`Sim.updateUnitWeapons`) and the hero is deliberately not one — making it a
target would mean the four "is it standing" checks CLAUDE.md warns about,
for a body that moves every tick. What hurts it is **contact**: every body
touching it chews at `HERO_CONTACT_DPS` by tier (30 a second for a T1, 220
for a T5), so standing in the horde is what kills a hero and standing at its
edge is the game. At zero it is **down for ten seconds** and stands back up
at the core with a second and a half of grace. The core is never healed by
it and its deaths cost the run nothing but the ten seconds.

## Building

Keys 1-4 drop the hero's turret of that slot **with the cursor at its
centre**, for one turret's price (`TIER_PRICE`, 48 / 158 / 711 / 5,400), from
within `HERO_BUILD_REACH` (twelve tiles, the dashed ring) and only once the
tier's band has opened on the run clock (`TIER_UNLOCK`, the same 0 / 3:47 /
7:34 / 11:20 as the deal). The economy is unchanged — the core pays on the
clock — so the trade a hero makes is one press of the deal's sixteen at a
time, placed exactly, from wherever it is standing. X sells the turret under
the cursor. The deal's corner, its keys and the Inspector are off on a hero
run; the hero bar stands where the Inspector did.

## Controls

WASD walks (the camera follows), the mouse aims, LMB holds the trigger, RMB
casts the secondary at the cursor, Space or Shift the move skill, R or Q the
ultimate, 1-4 build, X sells, P pauses, Esc is the menu.

## The seam

The hero's numbers cross as header slots (`simreport.ts HDR.HERO_*`, read by
`World.hero`) and its commands are two `SimHost` methods, `heroInput` every
frame and `heroCast` on a press. The rig borrows the sim's private paths
through `HeroPorts`, built once in `Sim.heroPorts`; nothing else in the sim
knows it is there beyond one `update` call after the towers fire.

## Not yet

Enemy shots and beams pass through the hero; only contact hurts it. There is
no hero on touch, no hero XP, no per-hero progression, and the balance above
is a first pass by arithmetic, not by play.
