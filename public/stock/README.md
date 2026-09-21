# Stock sprites

`sprites/` holds the **177 sprite files this game actually loads**, taken from
[Mindustry](https://github.com/Anuken/Mindustry)'s assets
(`core/assets-raw/sprites/`), by Anuken and contributors, licensed under
**GPL-3.0**. They are placeholder art in a personal prototype; the folder
layout under `sprites/` is upstream's own.

It used to be a full mirror of ~2,200 files. Everything nothing pointed at has
been deleted: the set here is exactly the paths named in `game/atlas.ts`,
`game/towerIcons.ts` and `game/maps.ts`, so a file in this tree is a file the
atlas composites or a flag falls back to.

Most of the game's art is NOT here and never was on disk — the units, the
turret heads, the terrain and the mission furniture are DRAWN at load
(`game/*Art.ts`, `game/tiles.ts`, behind the flags in `game/animalFlag.ts`,
`game/turretFlag.ts`, `game/terrainFlag.ts`).

This attribution is a GPL-3.0 requirement and stays as long as the files do.
Replace them with original art for a commercial release.
