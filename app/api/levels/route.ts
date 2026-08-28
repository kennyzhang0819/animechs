import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { UNIT_KINDS, WORLDS, type LevelDoc, type LevelStep } from "@/game/levels";

/**
 * Dev-only level persistence: the admin level editor POSTs a level document
 * and this writes it to public/levels/<id>.json, which the campaign overlays
 * onto its shipped script at startup (see levels.ts).
 *
 * Only ids that name a real world can be written — the id goes straight into
 * a path, so anything not matching a WORLDS entry is refused rather than
 * sanitized. Production builds refuse outright, exactly like /api/maps.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "level editing is a dev tool" }, { status: 403 });

  const doc = (await req.json()) as Partial<LevelDoc>;
  if (typeof doc.id !== "string" || !WORLDS.some((w) => w.id === doc.id))
    return NextResponse.json({ error: "unknown level id" }, { status: 400 });
  if (typeof doc.waveGap !== "number" || !(doc.waveGap >= 0) || doc.waveGap > 3600)
    return NextResponse.json({ error: "bad wave gap" }, { status: 400 });
  if (!Array.isArray(doc.script) || !doc.script.every(isStep))
    return NextResponse.json({ error: "bad script" }, { status: 400 });

  const dir = path.join(process.cwd(), "public", "levels");
  await mkdir(dir, { recursive: true }); // first save creates the folder
  await writeFile(
    path.join(dir, `${doc.id}.json`),
    JSON.stringify(
      { id: doc.id, waveGap: doc.waveGap, script: doc.script },
      null,
      1,
    ),
  );
  await addToIndex(dir, doc.id);
  return NextResponse.json({ ok: true });
}

/**
 * Every step is a wave of known unit kinds. Legacy `{ wait: n }` steps are
 * refused rather than ignored: pacing moved to the level's single waveGap,
 * and silently dropping a wait would let a stale client post a script whose
 * timing it still believed in.
 */
function isStep(step: unknown): step is LevelStep {
  if (!step || typeof step !== "object") return false;
  if (!("wave" in step)) return false;
  const wave = (step as { wave: unknown }).wave;
  if (Array.isArray(wave)) return wave.every((g) => isGroup(g));
  return isGroup(wave, false);
}

function isGroup(group: unknown, needsRegion = true): boolean {
  if (!group || typeof group !== "object") return false;
  for (const [key, value] of Object.entries(group)) {
    if (key === "region") {
      if (typeof value !== "number" || value < 0 || !Number.isInteger(value)) return false;
      continue;
    }
    if (!(UNIT_KINDS as readonly string[]).includes(key)) return false;
    if (typeof value !== "number" || value < 0 || !Number.isInteger(value)) return false;
  }
  return !needsRegion || "region" in group;
}

/**
 * Keep public/levels/index.json listing every level that has a document.
 * The loader reads this instead of blind-fetching each level, so unedited
 * levels never produce a console-visible 404 (see levels.ts). A missing or
 * mangled manifest is rebuilt from just this id rather than failing the
 * save — the document on disk is what matters, and the manifest is a hint.
 */
async function addToIndex(dir: string, id: string): Promise<void> {
  const file = path.join(dir, "index.json");
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // no manifest yet, or an unreadable one: start a fresh list
  }
  if (!ids.includes(id)) ids.push(id);
  await writeFile(file, JSON.stringify(ids.sort()));
}
