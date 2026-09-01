import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { TECH_KINDS } from "@/game/tech";

/**
 * How far off the origin a node may be saved. The board sizes itself to
 * whatever it holds, so a cell out here is not a crash — it is a node
 * dragged into the next county, which reads as the tree failing to render.
 * Two hundred cells is more than twenty times the board's own width.
 */
const LIMIT = 200;

/**
 * Dev-only tech-tree layout persistence: the admin dashboard POSTs the
 * cells it has moved and this writes public/tree.json, which the game reads
 * over the authored cells at startup (see game/layout.ts).
 *
 * Production refuses outright, exactly like /api/balance and /api/levels —
 * a shipped build must draw the tree it was compiled with, not a file
 * anyone who can reach the box could drop beside it.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "tree editing is a dev tool" }, { status: 403 });

  const body = (await req.json()) as unknown;
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "expected a cell per node" }, { status: 400 });

  const doc: Record<string, { x: number; y: number }> = {};
  for (const [id, raw] of Object.entries(body as Record<string, unknown>)) {
    if (!(TECH_KINDS as readonly string[]).includes(id))
      return NextResponse.json({ error: `unknown node ${id}` }, { status: 400 });
    if (!raw || typeof raw !== "object")
      return NextResponse.json({ error: `bad cell for ${id}` }, { status: 400 });
    const { x, y } = raw as Record<string, unknown>;
    for (const v of [x, y])
      if (
        typeof v !== "number" ||
        !Number.isInteger(v) ||
        Math.abs(v) > LIMIT
      )
        return NextResponse.json({ error: `bad cell for ${id}` }, { status: 400 });
    doc[id] = { x: x as number, y: y as number };
  }

  const dir = path.join(process.cwd(), "public");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "tree.json"), JSON.stringify(doc, null, 1));
  return NextResponse.json({ ok: true });
}
