import { access, writeFile } from "fs/promises";
import { ADMIN_ENABLED } from "@/game/env";
import path from "path";
import { NextResponse } from "next/server";
import type { MapData } from "@/game/maps";
import { MARK_KINDS } from "@/game/missionMarks";

/**
 * Dev-only map persistence: the editor POSTs an official map document and
 * this writes it back to public/maps/<id>.json — the repo file IS the map.
 * Only ids whose file already exists can be written (no path games, no
 * new maps from the browser), and production builds refuse entirely.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!ADMIN_ENABLED)
    return NextResponse.json({ error: "map editing is a dev tool" }, { status: 403 });

  const map = (await req.json()) as Partial<MapData>;
  if (typeof map.id !== "string" || !/^[a-z0-9-]+$/.test(map.id))
    return NextResponse.json({ error: "bad map id" }, { status: 400 });

  // THE SERVER DOES NOT POLICE MAP DIMENSIONS. A document carries the grid
  // width it was flattened at (`w`), so any size is a legal map and the
  // loader re-strides it on the way in — an editor should not be told its
  // map is the wrong shape. The only rule left is the one that would
  // actually corrupt a file: the three painted layers are indexed together
  // on load, so they have to be the same length as each other.
  const heights = new Set<number>();
  for (const [name, layer] of [
    ["floor", map.floor],
    ["wall", map.wall],
    ["blocked", map.blocked],
  ] as const) {
    if (!Array.isArray(layer) || layer.length === 0)
      return NextResponse.json({ error: `${name} layer is missing` }, { status: 400 });
    heights.add(layer.length);
  }
  if (heights.size !== 1)
    return NextResponse.json(
      { error: `floor, wall and blocked layers disagree on length (${[...heights].join(", ")})` },
      { status: 400 },
    );

  // ...and `w` has to divide them, or every row after the first lands at the
  // wrong offset. A document without one is read at LEGACY_COLS
  const len = [...heights][0];
  if (map.w !== undefined) {
    if (!Number.isInteger(map.w) || map.w <= 0 || len % map.w !== 0)
      return NextResponse.json(
        { error: `grid width ${map.w} does not divide ${len} cells` },
        { status: 400 },
      );
  }

  // the legacy per-cell `spawn` layer is optional; when present it is
  // indexed the same way, so it gets the same length rule
  for (const [name, layer] of [["spawn", map.spawn]] as const) {
    if (layer === undefined) continue;
    if (!Array.isArray(layer) || layer.length !== len)
      return NextResponse.json(
        { error: `${name} layer must be ${len} cells to match the painted layers` },
        { status: 400 },
      );
  }
  if (map.spawns !== undefined && !Array.isArray(map.spawns))
    return NextResponse.json({ error: "bad spawn circles" }, { status: 400 });
  // the spawn layer is SPARSE — a list of cell indices, not a cell per
  // entry (MapData.spawnTiles) — so what it has to satisfy is that every
  // index is a cell of this document
  if (map.spawnTiles !== undefined) {
    if (!Array.isArray(map.spawnTiles))
      return NextResponse.json({ error: "bad spawn tiles" }, { status: 400 });
    for (const i of map.spawnTiles)
      if (!Number.isInteger(i) || i < 0 || i >= len)
        return NextResponse.json(
          { error: `spawn tile ${i} is not a cell of this map (0..${len - 1})` },
          { status: 400 },
        );
  }
  if (!Array.isArray(map.pines) || !Array.isArray(map.decor))
    return NextResponse.json({ error: "bad props" }, { status: 400 });

  // THE MISSION MARKS (missionMarks.ts). The loader already drops a mark
  // it cannot read (maps.ts marksOf), so this is not what keeps a bad one
  // out of a run — it is what stops a bad one being WRITTEN, where it
  // would sit in the repo file looking authored and quietly do nothing
  if (map.marks !== undefined) {
    if (!Array.isArray(map.marks))
      return NextResponse.json({ error: "marks is not a list" }, { status: 400 });
    for (const m of map.marks) {
      const kind = MARK_KINDS.find((k) => k.id === m?.kind);
      if (!kind)
        return NextResponse.json({ error: `unknown mark kind "${m?.kind}"` }, { status: 400 });
      if (!Number.isInteger(m.x) || !Number.isInteger(m.y) || m.x < 0 || m.y < 0)
        return NextResponse.json({ error: `mark "${kind.id}" is off the board` }, { status: 400 });
    }
  }

  const file = path.join(process.cwd(), "public", "maps", `${map.id}.json`);
  try {
    await access(file); // official maps only — the file must already exist
  } catch {
    return NextResponse.json({ error: `no official map named "${map.id}"` }, { status: 404 });
  }
  try {
    await writeFile(file, JSON.stringify(map));
  } catch (err) {
    // a read-only checkout or a locked file: the editor can do nothing about
    // it, but the author needs to see which it was
    const why = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `could not write ${map.id}.json — ${why}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
