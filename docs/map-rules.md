# Map rules

The checklist. `authoring-maps.md` has the reasoning; this has the rules.

## Document

- A map is `public/maps/<id>.json`, listed in `OFFICIAL_MAP_IDS`; a world claims it by name in `WORLDS[].map`.
- Layers are flat arrays indexed `y * w + x`; height is `floor.length / w`.
- `blocked` is the only thing pathfinding reads.
- `wall` sentinels: `WALL_PINE` (4) and `WALL_DEEP` (7) are blocked, show their floor, and take no tower.
- Water floors are a list (`WATER_FLOOR_GROUPS`), not a range. Append floor families; never insert.
- Atlas indices are copied into each script, named identically. When a family moves, grep both.

## Geometry

- Author from a script in `scripts/maps/`, one per map, over `geom.mjs`. About thirty numbers describe a map.
- The script refuses to write when a check fails, prints its numbers every run, and writes a preview PNG on request.
- Every way through is 21 cells wide, for the swarm and the fleet. Measure the widest route; do not assume it.
- Turns are circular arcs with a chosen radius. Sharpest turn ≤ 26° over an 8-cell chord.
- Height changes are S-bends, never a single quarter arc.
- Mouths flare at the border: 68 cells easing to 21 over ~40% of the run (36 on an island beach).
- Tributaries merge at a lean of ~25°, never square.
- Blobs, not discs. An ellipse with a long axis and two cosine lobes.
- No loose rocks in open water. Rock is coast: long masses along the edges.
- Round the hills last: open the rock by a disc (r=8 on land, 4 on islands).
- Open the sea by a lane-wide disc, roads exempt.
- Seal orphan pockets; drain puddles under 60 cells; keep lagoons.
- Rivers are deep bank to bank. Shallow only at a ford. No footholds off a road on a bank.
- Crossings between islands: 21 to 60 cells. A bar (bare shallow) no more than 44.

## Doors and goals

- Every exit is on a border. Exits are a per-cell layer mask: ground 1, air 2, water 4.
- Spawns are per layer and independent. Boss zones are terrain-blind.
- Every non-boss zone reaches an exit on its own layer.
- No gate is a short cut: runs to the edge within 15% of each other.
- The choke holds: wall it and no gate still reaches an exit.
- Open == reachable from the gates.
- The base stands on road, near the exit edge, and the road runs past it and off.

## Room to build

- Towers stand only on blocked cells that are not sentinels. Count the rock.
- More than 200 4x4 footprints; more than 8,000 rock cells.

## Dressing

- Paint comes from rules, not a brush: the map's script, or `scripts/maps/dress.mjs` for the hand-drawn ones. Re-running overwrites every floor, wall and prop.
- One rock family. Nothing outlines a road; the rock either side of a road is the same rock.
- Where there is water, a coast family, BROAD: Quagmire's rim is about 40% of every mass. It follows the sea, never the roads.
- Every shape is DERIVED FROM THE GEOMETRY, never placed at random and never a noise threshold. Quagmire's heart is the island's own outline shrunk.
- The rock's second family is a CORE: each mass's outline shrunk by a set depth, so it shows only where the mass is thick.
- The road's second floor is a FEW LARGE blobs, wider than the road and clipped to it, so each takes the road's own edges. Not a chain of small shapes down the road: that reads as worms.
- A third floor only in the plazas: the cells furthest from any rock, taking the plaza's own shape.
- The rock contrasts with the floor, not with a line: dark dune over pale sand, dark carbon over grey stone.
- No dark floor along the rock's foot. Under the wall shadow it is a black line round every road at a distance.
- Boulders along the road's edges. Never down the middle, never in a drop zone, never round the base.
- No props while the terrain is being judged.

## Rules of play a map must respect

- A special mutator is map-bound: it is named in one world's `intrinsicMutation` or it throws at load.
- Amphibious counts water crossings on the ground routes; Hydrophobic taxes rock within 10 cells of water. Moving water moves both.
