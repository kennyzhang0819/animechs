import { access, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { NCELLS } from "@/game/constants";
import type { MapData } from "@/game/maps";

/**
 * Dev-only map persistence: the editor POSTs an official map document and
 * this writes it back to game/maps/<id>.json — the repo file IS the map.
 * Only ids whose file already exists can be written (no path games, no
 * new maps from the browser), and production builds refuse entirely.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "map editing is a dev tool" }, { status: 403 });

  const map = (await req.json()) as Partial<MapData>;
  if (typeof map.id !== "string" || !/^[a-z0-9-]+$/.test(map.id))
    return NextResponse.json({ error: "bad map id" }, { status: 400 });
  for (const layer of [map.floor, map.wall, map.blocked, map.spawn])
    if (!Array.isArray(layer) || layer.length !== NCELLS)
      return NextResponse.json({ error: "bad layer data" }, { status: 400 });
  if (!Array.isArray(map.pines) || !Array.isArray(map.decor))
    return NextResponse.json({ error: "bad props" }, { status: 400 });

  const file = path.join(process.cwd(), "game", "maps", `${map.id}.json`);
  try {
    await access(file); // official maps only — the file must already exist
  } catch {
    return NextResponse.json({ error: "unknown official map" }, { status: 404 });
  }
  await writeFile(file, JSON.stringify(map));
  return NextResponse.json({ ok: true });
}
