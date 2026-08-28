import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { TOWER_KINDS } from "@/game/types";

/**
 * Dev-only balance persistence: the admin dashboard POSTs one tuning
 * coefficient per turret and this writes public/balance.json, which the game
 * reads over the authored values at startup (see game/balance.ts).
 *
 * Production refuses outright, exactly like /api/levels and /api/maps — a
 * shipped build must price turrets from the tree it was compiled with, not
 * from a file anyone who can reach the box could drop beside it.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "balance editing is a dev tool" }, { status: 403 });

  const body = (await req.json()) as unknown;
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "expected an object of coefficients" }, { status: 400 });

  // Only known towers, only finite non-negative numbers, and a sane upper
  // bound: the coefficient multiplies an exponent, so a fat-fingered 1e9
  // would price the second turret past any bank the game can hold.
  const doc: Record<string, number> = {};
  for (const k of TOWER_KINDS) {
    const v = (body as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)
      return NextResponse.json({ error: `bad coefficient for ${k}` }, { status: 400 });
    doc[k] = v;
  }

  const dir = path.join(process.cwd(), "public");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "balance.json"), JSON.stringify(doc, null, 1));
  return NextResponse.json({ ok: true });
}
