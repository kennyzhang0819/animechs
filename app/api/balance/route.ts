import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { DIFFICULTIES } from "@/game/ladder";
import { TECH_KINDS } from "@/game/tech";

/** the two knobs, and the sane range each one may be saved in */
const LIMITS = {
  // an absolute first purchase, in whichever currency the bundle leads with
  base: 1_000_000,
  // an exponent, so the ceiling is low on purpose: a fat-fingered 40 would
  // price the second turret past any bank the game can hold
  growth: 4,
} as const;

/** the per-difficulty dials under the reserved `difficulties` key */
const DIFFICULTY_LIMITS = {
  // enemy level: hp is x1.06^level, so 100 is already x339 health and
  // anything past it is a typo
  level: 100,
  // a multiplier on shield pools; three digits already means an unbreakable
  // bubble, so anything past this is a typo
  shieldScale: 1000,
  // flat armour on every body — the armour scale itself tops out at 18
  groundArmorBonus: 100,
  airArmorBonus: 100,
} as const;

const DIFFICULTY_NAMES = DIFFICULTIES.map((d) => d.name);

/**
 * Dev-only balance persistence: the admin dashboard POSTs the knobs it has
 * bent and this writes public/balance.json, which the game reads over the
 * authored values at startup (see game/balance.ts).
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
    return NextResponse.json({ error: "expected an object of knobs per node" }, { status: 400 });

  // Only known nodes, only the two knobs, only finite numbers in range. The
  // bounds matter: growth is an exponent, so a fat-fingered 40 would price the
  // second turret past any bank the game can hold.
  const doc: Record<string, Record<string, number> | Record<string, Record<string, number>>> = {};
  for (const [id, raw] of Object.entries(body as Record<string, unknown>)) {
    // the reserved section: dials per difficulty NAME, not per tech node
    if (id === "difficulties") {
      if (!raw || typeof raw !== "object")
        return NextResponse.json({ error: "bad difficulties section" }, { status: 400 });
      const section: Record<string, Record<string, number>> = {};
      for (const [name, dials] of Object.entries(raw as Record<string, unknown>)) {
        if (!DIFFICULTY_NAMES.includes(name))
          return NextResponse.json({ error: `unknown difficulty ${name}` }, { status: 400 });
        if (!dials || typeof dials !== "object")
          return NextResponse.json({ error: `bad dials for ${name}` }, { status: 400 });
        const out: Record<string, number> = {};
        for (const [knob, limit] of Object.entries(DIFFICULTY_LIMITS)) {
          const v = (dials as Record<string, unknown>)[knob];
          if (v === undefined) continue;
          if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > limit)
            return NextResponse.json({ error: `bad ${knob} for ${name}` }, { status: 400 });
          out[knob] = v;
        }
        if (Object.keys(out).length > 0) section[name] = out;
      }
      if (Object.keys(section).length > 0) doc.difficulties = section;
      continue;
    }
    if (!(TECH_KINDS as readonly string[]).includes(id))
      return NextResponse.json({ error: `unknown node ${id}` }, { status: 400 });
    if (!raw || typeof raw !== "object")
      return NextResponse.json({ error: `bad knobs for ${id}` }, { status: 400 });
    const out: Record<string, number> = {};
    for (const [knob, limit] of Object.entries(LIMITS)) {
      const v = (raw as Record<string, unknown>)[knob];
      if (v === undefined) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > limit)
        return NextResponse.json({ error: `bad ${knob} for ${id}` }, { status: 400 });
      out[knob] = v;
    }
    if (Object.keys(out).length > 0) doc[id] = out;
  }

  const dir = path.join(process.cwd(), "public");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "balance.json"), JSON.stringify(doc, null, 1));
  return NextResponse.json({ ok: true });
}
