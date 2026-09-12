import { mkdir, writeFile } from "fs/promises";
import { ADMIN_ENABLED } from "@/game/env";
import path from "path";
import { NextResponse } from "next/server";
import { RUNG_COUNT } from "@/game/ladder";
import {
  MUTATIONS,
  MUT_COST_MAX,
  MUT_COST_MIN,
  MUT_COUNT_MAX,
} from "@/game/mutation";
import { TURRET_MOD_IDS } from "@/game/mods";
import { RARITIES } from "@/game/rarity";
import { TOWER_KINDS } from "@/game/types";

/** the two knobs, and the sane range each one may be saved in */
const LIMITS = {
  // an absolute first purchase, in whichever currency the bundle leads with
  base: 1_000_000,
  // an exponent, so the ceiling is low on purpose: a fat-fingered 40 would
  // price the second turret past any bank the game can hold
  growth: 4,
} as const;

/**
 * The per-rung dials under the reserved `difficulties` key — EVERY dial a
 * rung has (RungKnobs in ladder.ts), because a knob missing from this map
 * is silently dropped on save and reads to the user as a dial that will not
 * stick. Shield scale used to be here and is the Overshields mutator now.
 */
const DIFFICULTY_LIMITS = {
  // enemy level: hp is x1.06^level, so 100 is already x339 health and
  // anything past it is a typo
  level: 100,
  // what a roll may spend. The catalog's dearest rule is MUT_COST_MAX, so a
  // budget past a few dozen is buying rules that do not exist
  mutationPoints: 100,
  // how many rules the roll returns; the design ceiling, enforced here and
  // again on load (applyRungOverrides)
  mutationCount: MUT_COUNT_MAX,
} as const;

/**
 * The keys the `difficulties` section may name: a rung's 1-based ordinal,
 * "1" through "10" (rungKey in ladder.ts). It was the difficulty's NAME
 * until the ladder stopped having named difficulties.
 */
const RUNG_KEYS: readonly string[] = Array.from({ length: RUNG_COUNT }, (_, i) =>
  String(i + 1),
);

/**
 * The keys the `mutations` section may name — a rule's catalog id, and
 * nothing else. A cost saved for an id no build knows is a typo that would
 * sit in the file forever doing nothing, so it is a 400 rather than a
 * silent drop.
 */
const MUTATION_KEYS: readonly string[] = MUTATIONS.map((m) => m.id);

/**
 * THE ODDS SECTION. Three band tables plus the per-attribute roll chance,
 * and each one has a different idea of what a sane number is.
 *
 * A BAND WEIGHT IS RELATIVE, NOT A PERCENTAGE (rarity.ts): the roll
 * normalises whatever it is handed over the bands actually in the pool, so
 * the only real constraint is "not negative, not absurd". The ceiling is
 * here to catch a fat finger, not to express a design.
 *
 * A CHANCE IS A PROBABILITY and 1 is certainty, so that ceiling IS the
 * design: past it the number stops meaning anything.
 */
const WEIGHT_MAX = 1000;
const BAND_KEYS: readonly string[] = RARITIES;
const CHANCE_KEYS: readonly string[] = TURRET_MOD_IDS;

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
  if (!ADMIN_ENABLED)
    return NextResponse.json({ error: "balance editing is a dev tool" }, { status: 403 });

  const body = (await req.json()) as unknown;
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "expected an object of knobs per node" }, { status: 400 });

  // Only known nodes, only the two knobs, only finite numbers in range. The
  // bounds matter: growth is an exponent, so a fat-fingered 40 would price the
  // second turret past any bank the game can hold.
  const doc: Record<
    string,
    Record<string, number> | Record<string, Record<string, number>>
  > = {};
  for (const [id, raw] of Object.entries(body as Record<string, unknown>)) {
    // the reserved section: dials per RUNG ORDINAL, not per tech node
    if (id === "difficulties") {
      if (!raw || typeof raw !== "object")
        return NextResponse.json({ error: "bad difficulties section" }, { status: 400 });
      const section: Record<string, Record<string, number>> = {};
      for (const [name, dials] of Object.entries(raw as Record<string, unknown>)) {
        if (!RUNG_KEYS.includes(name))
          return NextResponse.json({ error: `unknown rung ${name}` }, { status: 400 });
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
    // the other reserved section: what each RULE is worth, by catalog id
    if (id === "mutations") {
      if (!raw || typeof raw !== "object")
        return NextResponse.json({ error: "bad mutations section" }, { status: 400 });
      const section: Record<string, number> = {};
      for (const [mid, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!MUTATION_KEYS.includes(mid))
          return NextResponse.json({ error: `unknown mutator ${mid}` }, { status: 400 });
        // whole points on the published scale: every reader spends these
        // against a whole budget, so a 2.5 would round differently in
        // different places and a 9 would buy a rule the design forbids
        if (
          typeof v !== "number" ||
          !Number.isInteger(v) ||
          v < MUT_COST_MIN ||
          v > MUT_COST_MAX
        )
          return NextResponse.json(
            { error: `bad cost for ${mid}; the scale is ${MUT_COST_MIN}-${MUT_COST_MAX} whole points` },
            { status: 400 },
          );
        section[mid] = v;
      }
      if (Object.keys(section).length > 0) doc.mutations = section;
      continue;
    }
    // the third reserved section: the odds every roll in the game is
    // weighed against
    if (id === "rarities") {
      if (!raw || typeof raw !== "object")
        return NextResponse.json({ error: "bad rarities section" }, { status: 400 });
      const section: Record<string, Record<string, number>> = {};
      for (const [table, entries] of Object.entries(raw as Record<string, unknown>)) {
        const chances = table === "chances";
        if (!chances && table !== "turret" && table !== "shape" && table !== "module")
          return NextResponse.json({ error: `unknown odds table ${table}` }, { status: 400 });
        if (!entries || typeof entries !== "object")
          return NextResponse.json({ error: `bad ${table} table` }, { status: 400 });
        const keys = chances ? CHANCE_KEYS : BAND_KEYS;
        const limit = chances ? 1 : WEIGHT_MAX;
        const out: Record<string, number> = {};
        for (const [key, v] of Object.entries(entries as Record<string, unknown>)) {
          if (!keys.includes(key))
            return NextResponse.json({ error: `unknown ${table} key ${key}` }, { status: 400 });
          if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > limit)
            return NextResponse.json(
              { error: `bad ${table} value for ${key}; the range is 0-${limit}` },
              { status: 400 },
            );
          out[key] = v;
        }
        if (Object.keys(out).length > 0) section[table] = out;
      }
      if (Object.keys(section).length > 0) doc.rarities = section;
      continue;
    }
    if (!(TOWER_KINDS as readonly string[]).includes(id))
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
