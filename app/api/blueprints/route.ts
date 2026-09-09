import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import type { Blueprint } from "@/game/blueprints";
import type { MapData } from "@/game/maps";

/**
 * Dev-only blueprint persistence: the map editor POSTs the whole library
 * and this writes it back to public/blueprints.json. Same shape and same
 * rules as /api/maps — the repo file IS the library, and production builds
 * refuse entirely.
 *
 * IT ALSO SWEEPS DELETED BLUEPRINTS OUT OF EVERY MAP, and that half has to
 * be here rather than in the editor. Deleting a blueprint deletes its
 * instances everywhere, but "everywhere" is nine map documents the editor
 * does not have open and must not have to load, rewrite and re-save one at
 * a time to honour a single click. The server has all of them on disk, so
 * it does the sweep in one pass and reports what it touched.
 *
 * A stale instance would be harmless even if the sweep were skipped — a
 * formation whose blueprint is gone resolves to nothing when the map is
 * read (formationsOf) — so this is about keeping the documents HONEST
 * rather than about correctness at run time. That is also why a failure to
 * rewrite one map is reported but does not fail the whole request: the
 * library edit itself has already succeeded and is worth keeping.
 */
interface Body {
  blueprints: Blueprint[];
  /** ids removed from the library by this save — swept from every map */
  deleted?: string[];
}

export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "blueprint editing is a dev tool" }, { status: 403 });

  const body = (await req.json()) as Partial<Body>;
  if (!Array.isArray(body.blueprints))
    return NextResponse.json({ error: "bad blueprint library" }, { status: 400 });

  // every entry has to be usable, because a library that will not load is
  // every formation on every map gone at once
  const seen = new Set<string>();
  for (const b of body.blueprints) {
    if (typeof b?.id !== "string" || !/^[a-z0-9-]+$/.test(b.id))
      return NextResponse.json({ error: `bad blueprint id "${b?.id}"` }, { status: 400 });
    if (seen.has(b.id))
      return NextResponse.json({ error: `two blueprints share the id "${b.id}"` }, { status: 400 });
    seen.add(b.id);
    if (!Number.isInteger(b.w) || b.w <= 0 || !Number.isInteger(b.h) || b.h <= 0)
      return NextResponse.json({ error: `blueprint "${b.id}" has no footprint` }, { status: 400 });
    if (!Array.isArray(b.parts))
      return NextResponse.json({ error: `blueprint "${b.id}" has no parts list` }, { status: 400 });
  }

  const file = path.join(process.cwd(), "public", "blueprints.json");
  try {
    await writeFile(file, JSON.stringify({ blueprints: body.blueprints }));
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `could not write blueprints.json — ${why}` }, { status: 500 });
  }

  const gone = (body.deleted ?? []).filter((id) => typeof id === "string" && !seen.has(id));
  if (gone.length === 0) return NextResponse.json({ ok: true });

  // THE SWEEP: take every instance of a deleted blueprint out of every map
  // document. Only maps that actually held one are rewritten, so a delete
  // does not churn the whole public/maps directory into a diff.
  const dir = path.join(process.cwd(), "public", "maps");
  const swept: string[] = [];
  const failed: string[] = [];
  let files: string[] = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    // no maps directory: nothing to sweep, and the library is already saved
    return NextResponse.json({ ok: true });
  }
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const doc = JSON.parse(await readFile(full, "utf8")) as MapData;
      const before = doc.formations;
      if (!Array.isArray(before) || before.length === 0) continue;
      const after = before.filter((inst) => !gone.includes(inst.id));
      if (after.length === before.length) continue;
      doc.formations = after;
      await writeFile(full, JSON.stringify(doc));
      swept.push(f.replace(/\.json$/, ""));
    } catch (err) {
      // one unreadable or unwritable map must not lose the library edit
      // that has already landed — name it and carry on
      console.warn(`blueprint sweep skipped ${f}`, err);
      failed.push(f.replace(/\.json$/, ""));
    }
  }
  return NextResponse.json({ ok: true, swept, failed });
}
