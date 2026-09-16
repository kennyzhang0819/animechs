import { copyFile, mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { NextResponse } from "next/server";
import { ADMIN_ENABLED } from "@/game/env";
import { graphSpecShape, specSource, type BiasTerm, type GraphSpec } from "@/game/mapgraph";

/**
 * THE GRAPH EDITOR'S BACK END — it runs the real generator and nothing
 * else. A graph (game/mapgraph.ts) comes in, its bias terms are turned
 * back into the closures a spec carries, and `scripts/maps/mindustry.mjs`
 * builds, checks and draws it exactly as the command line would.
 *
 * NOTHING HERE DECIDES WHAT A MAP IS. If the checks fail the editor is
 * told which ones and shown the picture anyway, because a picture of a
 * failing map is how an author finds out WHY — the same reason `run()`
 * writes its preview before it refuses to write the document.
 *
 * Dev only, like the other three: it writes files into the repo.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// the generator is plain ESM under scripts/ and imports node:fs, so it is
// loaded once, lazily, and only ever on the server
type Generated = {
  floor: Uint8Array | number[];
  wall: Uint8Array | number[];
  blocked: Uint8Array;
  spawns: { x: number; y: number; r: number; zone: string }[];
  base: { x: number; y: number };
  pines: unknown[];
  decor: unknown[];
};
type Gen = {
  build: (spec: unknown) => Generated;
  check: (spec: unknown, m: Generated) => string[];
  preview: (spec: unknown, m: Generated, sc?: number) => Uint8Array;
  scaleSpec: (spec: unknown) => unknown;
  SIZE: number;
  [k: string]: unknown;
};
let genPromise: Promise<Gen> | null = null;
const generator = (): Promise<Gen> => {
  // LOADED OFF DISK, NOT BUNDLED. The generator is a sibling of the map
  // specs and belongs to them; it is plain ESM that imports node:fs, and
  // a bundler that tried to follow it into the app would be wrong about
  // what it is. The URL is absolute because the compiled route does not
  // sit where this file does.
  genPromise ??= import(
    /* webpackIgnore: true */ pathToFileURL(
      path.join(process.cwd(), "scripts", "maps", "mindustry.mjs"),
    ).href
  ) as Promise<Gen>;
  return genPromise;
};

/** a tile index to the name the generator exports for it, floors and
 *  walls in one table with walls offset so the two cannot collide */
function tileNames(gen: Gen): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(gen)) {
    if (typeof v !== "number") continue;
    if (k.startsWith("FLOOR_")) out[v] = k;
    else if (k.startsWith("WALL_")) out[v + 1000] = k;
  }
  return out;
}

/**
 * THE TERM LIST BACK INTO A CLOSURE. Terms SUM, and a positive term is
 * drier: the bias is added to the water noise and water is what falls
 * below the level.
 */
function compileBias(terms: BiasTerm[]): (x: number, y: number) => number {
  const fns = terms.map((t): ((x: number, y: number) => number) => {
    switch (t.kind) {
      case "const":
        return () => t.v;
      case "well":
        return (x, y) => -t.depth * Math.exp(-((x - t.x) ** 2 + (y - t.y) ** 2) / (2 * t.r * t.r));
      case "ramp":
        return (x, y) => {
          const c = t.dir === "north" ? y : t.dir === "south" ? 255 - y : t.dir === "west" ? x : 255 - x;
          return Math.max(0, Math.min(1, (c - t.at) / t.span)) * t.amount;
        };
      case "channel":
        return (x, y) => {
          const c = t.axis === "x" ? x : y;
          const other = t.axis === "x" ? y : x;
          const centre = t.at + (t.skew ?? 0) * (other - 128);
          const taper =
            t.taperAt != null && t.taperSpan
              ? Math.max(0, Math.min(1, (t.taperAt - other) / t.taperSpan))
              : 1;
          return -t.depth * Math.exp(-((c - centre) ** 2) / (2 * t.width * t.width)) * taper;
        };
      case "spread":
        return (x, y) => {
          const c = t.axis === "x" ? x : y;
          return Math.min(t.amount, (Math.abs(c - t.at) / t.span) * t.amount);
        };
    }
  });
  return (x, y) => {
    let n = 0;
    for (const f of fns) n += f(x, y);
    return n;
  };
}

/** the graph as the object mindustry.mjs expects, closures and all —
 *  the SHAPE is mapgraph.ts's (so the editor and the emitted .mjs cannot
 *  disagree about it) and only the bias closure is built here */
function toSpec(g: GraphSpec): Record<string, unknown> {
  const shape = graphSpecShape(g);
  shape.water = { ...g.water, bias: compileBias(g.water.bias) };
  return shape;
}


/**
 * KEEP WHAT IS ABOUT TO BE LOST. Save and Export both overwrite a file in
 * the repo, and these files are not in git — so an overwrite used to be
 * final, and a graph edited in the browser could be destroyed by anything
 * that wrote the same name. Every write now copies the old file aside
 * first, under a timestamp, and the copies are never pruned: they are
 * small, and the whole point is that nobody has to have thought ahead.
 */
async function keep(file: string): Promise<void> {
  const dir = path.join(path.dirname(file), ".backups");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = path.basename(file);
  const dot = base.lastIndexOf(".");
  const name = dot < 0 ? `${base}-${stamp}` : `${base.slice(0, dot)}-${stamp}${base.slice(dot)}`;
  try {
    await mkdir(dir, { recursive: true });
    await copyFile(file, path.join(dir, name));
  } catch {
    // no previous file, or nowhere to put a copy — a save must not fail
    // because its safety net could not be hung
  }
}


/**
 * THE PLAYABLE DOCUMENT, built exactly as `run()` builds it — and refused
 * on a failing check for exactly the same reason: a map that does not pass
 * is not a map, and half of one in public/maps is worse than none. The
 * editor has already shown the picture, so the author is not being told
 * "no" without being told why.
 */
async function buildDocument(
  gen: Gen,
  spec: GraphSpec,
): Promise<{ doc: Record<string, unknown> } | { error: string; fails?: string[] }> {
  const quiet = console.log;
  console.log = () => {};
  try {
    const scaled = gen.scaleSpec(toSpec(spec));
    const m = gen.build(scaled);
    const fails = gen.check(scaled, m);
    if (fails.length)
      return { error: `${fails.length} check(s) failed — fix them before writing the map`, fails };
    return {
      doc: {
        id: spec.id,
        name: spec.name,
        w: gen.SIZE,
        base: m.base,
        floor: Array.from(m.floor),
        wall: Array.from(m.wall),
        blocked: Array.from(m.blocked),
        // SPAWNS ARE OMITTED WHEN THERE ARE NONE, never written empty: an
        // empty array is truthy, so spawnTilesOf would take the drop-zone
        // branch, paint nothing, and leave a map with no way in at all.
        // Absent falls through to the western strip instead, which is a
        // map that plays until someone paints the tiles they want.
        ...(m.spawns.length ? { spawns: m.spawns } : {}),
        pines: m.pines,
        decor: m.decor,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  } finally {
    console.log = quiet;
  }
}

const GRAPHS = () => path.join(process.cwd(), "scripts", "maps", "graphs");

function badId(id: unknown): id is string {
  return typeof id !== "string" || !/^[a-z0-9-]+$/.test(id);
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!ADMIN_ENABLED)
    return NextResponse.json({ error: "the map graph editor is a dev tool" }, { status: 403 });

  const body = (await req.json()) as {
    action?: string;
    spec?: GraphSpec;
    id?: string;
    alsoMap?: boolean;
  };
  const action = body.action ?? "generate";

  if (action === "list") {
    // the palette comes back with the listing because the names and the
    // indices are only known to agree inside the generator
    const gen = await generator();
    const floors: { v: number; name: string }[] = [];
    const walls: { v: number; name: string }[] = [];
    for (const [k, v] of Object.entries(gen)) {
      if (typeof v !== "number") continue;
      if (k.startsWith("FLOOR_")) floors.push({ v, name: k.slice(6) });
      else if (k.startsWith("WALL_")) walls.push({ v, name: k.slice(5) });
    }
    floors.sort((a, b) => a.v - b.v);
    walls.sort((a, b) => a.v - b.v);
    let ids: string[] = [];
    try {
      const files = await readdir(GRAPHS());
      ids = files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
    } catch {
      ids = [];
    }
    return NextResponse.json({ ids, floors, walls });
  }

  if (action === "load") {
    if (badId(body.id)) return NextResponse.json({ error: "bad graph id" }, { status: 400 });
    try {
      const raw = await readFile(path.join(GRAPHS(), `${body.id}.json`), "utf8");
      return NextResponse.json({ spec: JSON.parse(raw) as GraphSpec });
    } catch {
      return NextResponse.json({ error: `no graph named "${body.id}"` }, { status: 404 });
    }
  }

  const spec = body.spec;
  if (!spec || badId(spec.id))
    return NextResponse.json({ error: "bad graph" }, { status: 400 });

  const gen = await generator();

  if (action === "save") {
    await mkdir(GRAPHS(), { recursive: true });
    const graphFile = path.join(GRAPHS(), `${spec.id}.json`);
    const specFile = path.join(process.cwd(), "scripts", "maps", `${spec.id}.mjs`);
    await keep(graphFile);
    await keep(specFile);
    await writeFile(graphFile, JSON.stringify(spec, null, 2));
    await writeFile(specFile, specSource(spec, tileNames(gen)));
    const wrote = [`scripts/maps/graphs/${spec.id}.json`, `scripts/maps/${spec.id}.mjs`];
    // AND THE MAP ITSELF, if this id already is one. Saving the source and
    // leaving the document the game loads on the old terrain is a save
    // that did nothing a player can see, so an edit to a map that exists
    // updates that map rather than making a second thing to reconcile.
    const doc = await buildDocument(gen, spec);
    if ("error" in doc) return NextResponse.json({ ok: true, wrote, mapError: doc.error });
    const mapFile = path.join(process.cwd(), "public", "maps", `${spec.id}.json`);
    let exists = true;
    try {
      await readFile(mapFile);
    } catch {
      exists = false;
    }
    if (exists || body.alsoMap) {
      await keep(mapFile);
      await writeFile(mapFile, JSON.stringify(doc.doc));
      wrote.push(`public/maps/${spec.id}.json`);
    }
    return NextResponse.json({ ok: true, wrote });
  }

  if (action === "export") {
    const built = await buildDocument(gen, spec);
    if ("error" in built)
      return NextResponse.json({ error: built.error, fails: built.fails }, { status: 400 });
    const file = path.join(process.cwd(), "public", "maps", `${spec.id}.json`);
    await keep(file);
    await writeFile(file, JSON.stringify(built.doc));
    return NextResponse.json({ ok: true, wrote: [`public/maps/${spec.id}.json`] });
  }

  // generate: build, check, draw — and say what happened either way
  const log: string[] = [];
  const realLog = console.log;
  // the generator REPORTS through console.log — its own numbers and every
  // check line — and those lines are the whole point of pressing Generate
  console.log = (...args: unknown[]) => void log.push(args.map(String).join(" "));
  let fails: string[] = [];
  let png: Uint8Array | null = null;
  let blocked: Uint8Array | null = null;
  let threw: string | null = null;
  try {
    const scaled = gen.scaleSpec(toSpec(spec));
    const m = gen.build(scaled);
    fails = gen.check(scaled, m);
    png = gen.preview(scaled, m, 1);
    blocked = m.blocked;
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  } finally {
    console.log = realLog;
  }

  return NextResponse.json({
    ok: !threw && fails.length === 0,
    threw,
    fails,
    log,
    size: gen.SIZE,
    png: png ? Buffer.from(png).toString("base64") : null,
    // the wall mask, so the editor can darken the hills without a second
    // copy of the generator's tone tables living in the browser
    blocked: blocked ? Buffer.from(blocked).toString("base64") : null,
  });
}
