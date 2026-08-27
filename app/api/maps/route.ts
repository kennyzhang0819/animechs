import { access, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { COLS, NCELLS } from "@/game/constants";
import type { MapData } from "@/game/maps";

/**
 * Dev-only map persistence: the editor POSTs an official map document and
 * this writes it back to public/maps/<id>.json — the repo file IS the map.
 * Only ids whose file already exists can be written (no path games, no
 * new maps from the browser), and production builds refuse entirely.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "map editing is a dev tool" }, { status: 403 });

  const map = (await req.json()) as Partial<MapData>;
  if (typeof map.id !== "string" || !/^[a-z0-9-]+$/.test(map.id))
    return NextResponse.json({ error: "bad map id" }, { status: 400 });

  // A document is as tall as it needs to be: mapFromTerrain trims unused pad
  // rows, so a layer is COLS * rows long for some rows <= ROWS rather than a
  // fixed NCELLS. All three painted layers must agree on that height, since
  // the loader indexes them together.
  const heights = new Set<number>();
  for (const [name, layer] of [
    ["floor", map.floor],
    ["wall", map.wall],
    ["blocked", map.blocked],
  ] as const) {
    if (!Array.isArray(layer))
      return NextResponse.json({ error: `${name} layer is missing` }, { status: 400 });
    if (layer.length === 0 || layer.length % COLS !== 0 || layer.length > NCELLS)
      return NextResponse.json(
        {
          error: `${name} layer is ${layer.length} cells — expected a multiple of ${COLS} up to ${NCELLS}`,
        },
        { status: 400 },
      );
    heights.add(layer.length);
  }
  if (heights.size !== 1)
    return NextResponse.json(
      { error: `floor, wall and blocked layers disagree on height (${[...heights].join(", ")})` },
      { status: 400 },
    );

  // `spawn` is the legacy per-cell drop-zone layer: read from old documents,
  // never written by the editor (it emits `spawns` circles instead). Accept
  // its absence, and only check the shape when a document still carries it.
  if (map.spawn !== undefined && (!Array.isArray(map.spawn) || map.spawn.length % COLS !== 0))
    return NextResponse.json({ error: "bad legacy spawn layer" }, { status: 400 });
  if (map.spawns !== undefined && !Array.isArray(map.spawns))
    return NextResponse.json({ error: "bad spawn regions" }, { status: 400 });
  if (!Array.isArray(map.pines) || !Array.isArray(map.decor))
    return NextResponse.json({ error: "bad props" }, { status: 400 });

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
