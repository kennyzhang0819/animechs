/**
 * MISSION MARKS — the things a mission needs placed ON A MAP, as one
 * registry the map editor builds its tools out of. See
 * docs/mission-marks.md for what the system is and how to add a kind.
 *
 * A mark is AUTHORED DATA in the map document (maps.ts MapData.marks) and
 * a mission kind is what gives it meaning. The registry is the only place
 * that knows both, so adding a mission's furniture is one entry here
 * rather than an edit to the editor, the loader and the panel.
 */
import type { Mission } from "./levels";

/**
 * WHAT SHAPE OF THING AN AUTHOR PLACES. A `point` is one footprint at
 * `x`/`y`; a `path` is a polyline in `pts`, every leg of it on the
 * eight-heading lattice (missions.ts, roadProblems) and `x`/`y` kept on
 * the first corner so every reader that only wants a place has one.
 */
export type MarkGeom = "point" | "path";

/**
 * ONE PLACED MARK, as the map document carries it (maps.ts MapData.marks).
 * `x`/`y` are the top-left cell of its footprint, like a beacon's; `opts`
 * is whatever its kind's fields say, and is read through markOpts so a
 * document missing one still loads.
 */
export interface MapMark {
  kind: string;
  x: number;
  y: number;
  /** a `path` mark's corners in cells, entry first and exit last. A road
   *  runs off the rim at both ends, so these may lie off the board */
  pts?: readonly (readonly [number, number])[];
  opts?: Record<string, string | number>;
}

/** the most marks one map may carry — an authoring bound, not a rule */
export const MAX_MARKS = 64;

/**
 * ONE EDITABLE NUMBER OR CHOICE on a mark, as the editor should offer it.
 * The panel is built from these rather than written per kind, which is
 * the whole reason a new mission's mark costs no UI.
 */
export type MarkField =
  | { key: string; label: string; kind: "int"; min: number; max: number; def: number }
  | {
      key: string;
      label: string;
      kind: "choice";
      choices: readonly { value: string; label: string }[];
      def: string;
    }
  /** A LIST OF WAVES, written the way a person says one: "2-7", "2,4,6",
   *  "2-3,6". It is its own field kind rather than a free text box because
   *  a wave list is a real thing in this game and the parser belongs with
   *  it (parseWaves), not in whichever panel happens to render it. */
  | { key: string; label: string; kind: "waves"; def: string }
  /** a short line of prose — what the objective panel calls this thing */
  | { key: string; label: string; kind: "text"; def: string; max?: number };

export interface MarkKind {
  id: string;
  label: string;
  /** which missions understand it — the editor offers a mark only on a map
   *  whose world plays one of these */
  missions: readonly Mission["kind"][];
  geom: MarkGeom;
  /** footprint in cells, square */
  size: number;
  /** the ink it is drawn in, in the editor and on the board overlay */
  color: string;
  /** cells of metal decking laid round the footprint, if this kind wants
   *  its ground to look prepared (renderer.rebuildTerrain). 0 for none */
  pad: number;
  /** the int field, if any, that is a RADIUS IN CELLS round the mark: the
   *  editor rings it, so a region an author sets as a number is a region
   *  they can see the size of */
  radiusField?: string;
  fields: readonly MarkField[];
}

/**
 * "2-7", "2,4,6", "2-3,6" — every wave a spot is due on, sorted, deduped,
 * and clamped to something an author could plausibly mean. Anything it
 * cannot read is dropped rather than thrown: this parses a string typed
 * into a box, and a half-typed range must not take the editor down.
 */
export function parseWaves(raw: string | number | undefined): number[] {
  const out = new Set<number>();
  for (const part of String(raw ?? "").split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    for (let w = Math.max(1, Math.min(a, b)); w <= Math.min(WAVE_CEIL, Math.max(a, b)); w++)
      out.add(w);
  }
  return [...out].sort((x, y) => x - y);
}
/** the highest wave a list may name — an authoring bound, not a rule: a
 *  wave the mission never sends simply never comes */
export const WAVE_CEIL = 40;

/**
 * THE BUFF TOWERS the swarm plants on an intercept map (levels.ts `goad`
 * and `bastion`): where one stands, which of the two it is, and WHICH
 * TRAIN WAVE IT RISES ON.
 *
 * The wave rides the mark rather than the mission because the mission
 * spec is code and the map document is the only thing an author can
 * write from the editor — and because it is an attribute OF this tower,
 * the way a beacon's cell is an attribute of that beacon. What a "train
 * wave" IS stays the mission's: it is the launch index of
 * InterceptMission.pattern (Sim.runCrossers).
 */
const BUFF_TOWER: MarkKind = {
  id: "buffTower",
  label: "Buff tower",
  missions: ["intercept"],
  geom: "point",
  size: 4,
  color: "#ff5c73",
  pad: 2,
  fields: [
    {
      key: "tower",
      label: "Tower",
      kind: "choice",
      choices: [
        { value: "goad", label: "Goad — speed" },
        { value: "bastion", label: "Bastion — resistance" },
      ],
      def: "goad",
    },
    // A SPOT, NOT A RISE. Every wave named here is a wave this spot puts a
    // tower up on — and one whose tower is still standing does nothing
    // (Sim.raiseMarkTowers). So "2-7" is "hold this ground from the second
    // train on", which is what an author means, and the board's answer is
    // to keep knocking it down.
    { key: "waves", label: "Rises on waves", kind: "waves", def: "1" },
  ],
};

/**
 * ONE RAILGUN EMPLACEMENT the siege stands up (levels.ts RazeMission) —
 * the gun itself, on the cell an author put it on, pointing at the core.
 *
 * EVERY GUN IS PLACED, NOT RUNG. The region below used to carry a count
 * and the sim spread that many guns round its radius; a ring is a shape,
 * and where a gun stands is a decision about cover, approach and what a
 * board has to walk past to reach it. So a gun is a mark, and how many
 * rise is how many you drew.
 *
 * WHICH SECTION IT BELONGS TO is its `wave`, the same number a region
 * carries: everything with that number rises together on the mission's
 * clock (RazeMission.first/every).
 */
const RAILGUN: MarkKind = {
  id: "railgun",
  label: "Railgun",
  missions: ["raze"],
  geom: "point",
  size: 4,
  color: "#ff8a3a",
  pad: 2,
  fields: [{ key: "wave", label: "Rises in section", kind: "int", min: 1, max: 4, def: 1 }],
};

/**
 * A GARRISON REGION over the guns (levels.ts RazeMission): the ground the
 * Wardens hold, how far it reaches, and how many of each stand in it.
 *
 * IT STANDS NO GUNS ITSELF. The emplacements are their own marks
 * (RAILGUN above); this is the circle round them that a board has to take
 * to get at one — Sim.garrisonUnit leashes every body raised here to it,
 * and the radius is both that leash and the ground they scatter over.
 *
 * SEVERAL MAY SHARE A SECTION, and everything with that `wave` rises
 * together, so "two regions at once on the third" is two marks and not a
 * new field.
 */
const BATTERY: MarkKind = {
  id: "battery",
  label: "Garrison region",
  missions: ["raze"],
  geom: "point",
  size: 4,
  color: "#ffb44a",
  pad: 0,
  radiusField: "radius",
  fields: [
    { key: "wave", label: "Rises in section", kind: "int", min: 1, max: 4, def: 1 },
    { key: "radius", label: "Region radius", kind: "int", min: 8, max: 60, def: 26 },
    { key: "bulwark", label: "Bulwarks", kind: "int", min: 0, max: 24, def: 2 },
    { key: "lance", label: "Lances", kind: "int", min: 0, max: 24, def: 2 },
  ],
};

/**
 * A ROAD — the line a crosser walks (missions.ts): the Borers' lines on an
 * intercept map, the convoy's on an escort one. The corners are the
 * mark's `pts` and the map is where they live, so moving a road is a drag
 * in the editor rather than an edit to a table of numbers.
 *
 * THE ORDER OF THE MARKS IS THE ORDER OF THE ROADS. A mission names a
 * road by index (InterceptMission.pattern, EscortMission.pattern), so the
 * first road mark on the document is road 0. Re-ordering them re-points
 * the pattern, which is why the panel prints the index.
 *
 * EVERY LEG IS ON THE EIGHT-HEADING LATTICE and the editor snaps a
 * dragged corner to it (editor.ts snapLattice) rather than letting one be
 * drawn wrong and refused at load — see the note at the top of
 * missions.ts for why the lattice is the rule.
 */
const ROAD: MarkKind = {
  id: "road",
  label: "Road",
  missions: ["intercept", "escort"],
  geom: "path",
  size: 3,
  color: "#7fd0ff",
  pad: 0,
  fields: [{ key: "name", label: "Name", kind: "text", def: "the line" }],
};

export const MARK_KINDS: readonly MarkKind[] = [BUFF_TOWER, RAILGUN, BATTERY, ROAD];

/**
 * EVERY CELL OF METAL DECKING A MARK LAYS — its own footprint and the pad
 * round it, corners cut so the patch reads as a laid deck rather than as a
 * rectangle somebody dropped on the snow.
 *
 * ONE FUNCTION BECAUSE IT IS ONE PATCH: the renderer draws these cells
 * (renderer.rebuildTerrain) and the board refuses to build on them
 * (board.ts `reserved`), and the plate a player can see has to be exactly
 * the plate they are kept off. It takes the map's bounds because the rect
 * is clipped to them before the corners are cut, so a mark near the edge
 * keeps the shape it is drawn with.
 */
export function forEachMarkPadCell(
  m: MapMark,
  cols: number,
  rows: number,
  fn: (x: number, y: number) => void,
): void {
  const k = markKind(m.kind);
  // a path lays no decking: a road is a line the board may build right up
  // to, and `x`/`y` on one is its first corner rather than a footprint
  if (!k || k.geom !== "point") return;
  const x0 = Math.max(0, m.x - k.pad), y0 = Math.max(0, m.y - k.pad);
  const x1 = Math.min(cols, m.x + k.size + k.pad);
  const y1 = Math.min(rows, m.y + k.size + k.pad);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const dx = Math.min(x - x0, x1 - 1 - x), dy = Math.min(y - y0, y1 - 1 - y);
      if (dx + dy < k.pad) continue;
      fn(x, y);
    }
}

export const markKind = (id: string): MarkKind | null =>
  MARK_KINDS.find((k) => k.id === id) ?? null;

/** the mark kinds a map running these missions may carry */
export const marksForMissions = (kinds: readonly Mission["kind"][]): readonly MarkKind[] =>
  MARK_KINDS.filter((k) => k.missions.some((m) => kinds.includes(m)));

/** a field's value off a mark, falling back to its default — the one
 *  reader, so a hand-edited document missing a field still loads */
export function markField(
  opts: Readonly<Record<string, string | number>> | undefined,
  f: MarkField,
): string | number {
  const had = opts?.[f.key];
  if (f.kind === "waves") {
    const list = parseWaves(had as string);
    return list.length > 0 ? list.join(",") : f.def;
  }
  if (f.kind === "int") {
    const n = typeof had === "number" ? had : Number(had);
    return Number.isFinite(n) ? Math.max(f.min, Math.min(f.max, Math.round(n))) : f.def;
  }
  if (f.kind === "text") {
    const t = typeof had === "string" ? had.trim() : "";
    return t ? t.slice(0, f.max ?? 40) : f.def;
  }
  return typeof had === "string" && f.choices.some((c) => c.value === had) ? had : f.def;
}

/** every field of a mark, cleaned — what the loader and the sim read */
export function markOpts(
  kind: MarkKind,
  opts: Readonly<Record<string, string | number>> | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const f of kind.fields) out[f.key] = markField(opts, f);
  return out;
}
