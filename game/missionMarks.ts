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
import type { Mission, UnitKind } from "./levels";
import type { TowerKind } from "./types";
import { TOWERS } from "./constants";

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
  // NOTHING DECLARES ONE TODAY — the garrison lost its wave list when
  // garrisons became a thing that is simply already there (GARRISON
  // below). The kind stays wired end to end for the next mark that wants
  // a schedule on it
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
  /**
   * THE BODY THIS MARK PUTS DOWN, and therefore its FACE: the palette
   * swatch and the block on the map both wear that unit's own portrait,
   * carved off the atlas (atlas.ts unitIcon) exactly as the HUD's do.
   *
   * A mark used to draw as a coloured square under a stock power-node
   * sprite, which meant four different pieces of mission furniture were
   * four identical pylons — the one thing a picture is for, saying which
   * is which, was the one thing it did not do.
   */
  unit: UnitKind;
  /** the choice field, if any, whose value is the body that will actually
   *  rise here — a buff tower is a Goad or a Bastion, and the block on the
   *  map has to be whichever one the author picked */
  unitField?: string;
  /** ...and the same for a mark that stands a TURRET up rather than a body
   *  (EMPLACEMENT): its choice field names a TowerKind, and the block
   *  wears that turret's head instead of a unit portrait */
  towerField?: string;
  /** the turret this mark stands up, and therefore its face (markTower) */
  tower?: TowerKind;
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
 * ONE BUFF TOWER on an intercept map (levels.ts `goad` and `bastion`):
 * WHICH of the two, WHERE it stands, and WHICH TRAIN it is up for. All
 * three are the author's, and none of them is rolled.
 *
 * IT WAS A SPOT AND A DIE ROLL ONCE, and the roll was the wrong idea. A
 * tower's BUFF IS GLOBAL — Sim.goadMul and Sim.bastionCut read the alive
 * census, so a Goad anywhere on the board speeds every train — and what
 * its POSITION decides is how far a run has to travel, and past what, to
 * take it down. That is a thing an author looks at the map to judge, and
 * a shuffle threw it away: two runs of one map asked for different trips
 * for no reason a player could see, so nothing a run taught them was
 * worth carrying.
 *
 * SO A MARK IS A TOWER AND NOT A SPOT. Train 3 comes in under exactly
 * the towers drawn for train 3, every run, and the escalation is the
 * marks an author laid rather than a curve the game owns.
 *
 * THEY ACCUMULATE. A tower is up from its train until the board kills
 * it, and the two buffs STACK BY MULTIPLYING, so a run that answers none
 * of them meets the last train under all of them. That is the mission:
 * clearing the road is not a side errand the intercept offers, it is the
 * bill, and an author sizing a map has to count the standing total at
 * the last train rather than the towers on any one of them.
 */
const BUFF_TOWER: MarkKind = {
  id: "buffTower",
  label: "Buff tower",
  missions: ["intercept"],
  geom: "point",
  size: 4,
  color: "#ff5c73",
  unit: "goad",
  unitField: "unit",
  pad: 2,
  fields: [
    {
      key: "unit",
      label: "Tower",
      kind: "choice",
      choices: [
        { value: "goad", label: "Goad" },
        { value: "bastion", label: "Bastion" },
      ],
      def: "goad",
    },
    { key: "wave", label: "Rises on train", kind: "int", min: 1, max: WAVE_CEIL, def: 2 },
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
  unit: "railgun",
  pad: 2,
  fields: [{ key: "wave", label: "Rises in section", kind: "int", min: 1, max: 4, def: 1 }],
};

/**
 * A GARRISON — a circle of ground the swarm HOLDS, and what holds it.
 *
 * IT BELONGS TO NO MISSION. This started as the guard over a railgun
 * battery and is not that any more: a garrison is a fact about a PLACE —
 * there is a force dug in here and it will not follow you home — and
 * every board has places worth denying. So it is offered on every map,
 * whatever the mission, and the emplacements it used to be bolted to are
 * their own marks now (RAILGUN above).
 *
 * THE RANGE IS THE LEASH AND THE PICTURE. `radius` is exactly the circle
 * Sim.garrisonUnit holds every body raised here to — they fight what
 * comes into it and cannot be drawn out — and exactly the ring the board
 * draws. One number, so what an author sets is what a player sees.
 *
 * IT IS STANDING BEFORE THE RUN STARTS, and there is no schedule on it.
 * Every garrison a map carries is manned at mission start (Sim.reset) and
 * never manned again — a garrison is ground the swarm ALREADY HOLDS, not
 * a thing that arrives, and a board that has taken one has taken it. The
 * mark carried a wave list once and the list was the wrong question: it
 * made a dug-in force into a respawn, and a player who cleared a post
 * watched it come back for reasons the board never showed them.
 *
 * WHAT STANDS IN IT IS ONE NUMBER (levels.ts GARRISON_LEVELS). A rung
 * from 1 to 5 names a fixed count of swarm per tier, and the mix is a
 * table rather than ten fields on the mark: what placing a garrison is a
 * decision about is WHERE and HOW HARD, and every level 3 on every map
 * should be the same fight.
 *
 * THE SWARM HALF IS NOT AUTHORED EITHER. The tier counts are filled from
 * whichever family the circle rolled at reset (Sim.garrisonFamilies) —
 * one family a circle, kept for the whole run — so the same rung is a
 * different board every deploy.
 */
const GARRISON: MarkKind = {
  id: "garrison",
  label: "Garrison",
  missions: ["hold", "survive", "intercept", "escort", "raze"],
  geom: "point",
  size: 4,
  color: "#ffb44a",
  unit: "ironhide3",
  pad: 0,
  radiusField: "radius",
  fields: [
    { key: "radius", label: "Range", kind: "int", min: 8, max: 90, def: 44 },
    { key: "level", label: "Level", kind: "int", min: 1, max: 5, def: 1 },
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
  // the thing that crawls it — a convoy walks one of these too, but the
  // Borer's head is what a player pictures when they see a line drawn
  // across a map
  unit: "wormhead",
  pad: 0,
  fields: [{ key: "name", label: "Name", kind: "text", def: "the line" }],
};

/**
 * ONE OF THE SWARM'S TURRETS, standing where an author put it (types.ts
 * ENEMY_ONLY_KINDS, constants.ts TOWERS). It is up from mission start and
 * it never moves, and it belongs to no mission: a gun dug in on a piece
 * of ground is a fact about the board, the same way a garrison is.
 *
 * THE FOUR USED TO BE BODIES — the Wardens a garrison was manned with.
 * What they were was already a turret in everything but bookkeeping: they
 * held a circle, they never walked at the core, and the whole of what a
 * run did with one was go over there and take it down. So they are
 * turrets, with the pools, the plating and the weapons they had, and a
 * garrison is ordinary swarm again (levels.ts GARRISON_LEVELS).
 *
 * IT OWNS ITS CELLS AND NOT THE PATH. Nothing may be built over one
 * (Sim.cellTower) and shots collide with it, but the swarm's routes run
 * straight through the square it stands on — the rule every building of
 * the swarm's is under (Sim.conquerTower says why): its own bodies will
 * not shoot it, so a wall they cannot pass and will not break is a wall
 * they would stand at forever.
 */
const EMPLACEMENT: MarkKind = {
  id: "emplacement",
  label: "Enemy turret",
  missions: ["hold", "survive", "intercept", "escort", "raze"],
  geom: "point",
  size: 4,
  color: "#ff5c73",
  unit: "railgun",
  tower: "bulwark",
  towerField: "tower",
  // NO DECKING. The plated ground is for the two marks that promise
  // something will rise on a cell LATER — the railgun its section is due
  // on, the buff tower its train — so a player reads the promise off the
  // board before anything stands there. A turret is up from the first
  // frame and is its own announcement; a plate under one says nothing
  // twice
  pad: 0,
  fields: [
    {
      key: "tower",
      label: "Turret",
      kind: "choice",
      choices: [
        { value: "lance", label: "Lance" },
        { value: "bulwark", label: "Bulwark" },
        { value: "halberd", label: "Halberd" },
        { value: "juggernaut", label: "Juggernaut" },
      ],
      def: "bulwark",
    },
  ],
};

export const MARK_KINDS: readonly MarkKind[] = [BUFF_TOWER, RAILGUN, GARRISON, EMPLACEMENT, ROAD];

/** the turret a mark stands up, where it stands one — the TowerKind twin
 *  of markUnit (EMPLACEMENT) */
export function markTower(m: MapMark): TowerKind | null {
  const k = markKind(m.kind);
  if (!k?.towerField) return null;
  const f = k.fields.find((x) => x.key === k.towerField);
  return f?.kind === "choice" ? (markField(m.opts, f) as TowerKind) : (k.tower ?? null);
}

/**
 * THE FOOTPRINT A MARK ACTUALLY OCCUPIES, in cells — what it is drawn as,
 * what a click hits, and what another mark may not overlap.
 *
 * IT IS THE TURRET'S OWN SIZE where a mark stands a turret up
 * (EMPLACEMENT): the four are 2x2, 2x2, 3x3 and 4x4, and one fixed square
 * for all of them would be the wrong picture for three and a lie about
 * the ground for all four. `MarkKind.size` is the fallback, which is what
 * every other kind uses.
 */
export function markSize(m: MapMark): number {
  const k = markKind(m.kind);
  if (!k) return 1;
  const t = markTower(m);
  return t ? TOWERS[t].size : k.size;
}
/** the same, for a kind and a chosen turret — the stamp knows both before
 *  a mark exists to ask */
export const markSizeFor = (k: MarkKind, tower: TowerKind | null): number =>
  tower ? TOWERS[tower].size : k.size;

/** every turret face a mark may wear — what a panel carves up front */
export const MARK_TOWERS: readonly TowerKind[] = [
  ...new Set(
    MARK_KINDS.flatMap((k) => {
      const f = k.towerField ? k.fields.find((x) => x.key === k.towerField) : null;
      return f?.kind === "choice" ? f.choices.map((c) => c.value as TowerKind) : [];
    }),
  ),
];

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
  // ...and NEITHER DOES pad 0, which is what the field has always said it
  // meant. It was decking the footprint anyway, so a garrison wore a four
  // by four plate on the board — furniture under a mark whose whole
  // picture is its circle, and a square of prepared ground promising
  // something would stand exactly there when nothing ever does
  if (k.pad <= 0) return;
  const size = markSize(m);
  const x0 = Math.max(0, m.x - k.pad), y0 = Math.max(0, m.y - k.pad);
  const x1 = Math.min(cols, m.x + size + k.pad);
  const y1 = Math.min(rows, m.y + size + k.pad);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const dx = Math.min(x - x0, x1 - 1 - x), dy = Math.min(y - y0, y1 - 1 - y);
      if (dx + dy < k.pad) continue;
      fn(x, y);
    }
}

export const markKind = (id: string): MarkKind | null =>
  MARK_KINDS.find((k) => k.id === id) ?? null;

/**
 * WHOSE PORTRAIT THIS MARK WEARS. A kind's own body, unless the mark
 * CHOSE one — a buff tower is a Goad or a Bastion and the block on the
 * map has to be the one that will actually rise there, or an author is
 * reading the palette instead of the board.
 */
export function markUnit(m: MapMark): UnitKind | null {
  const k = markKind(m.kind);
  if (!k) return null;
  if (k.unitField) {
    const f = k.fields.find((x) => x.key === k.unitField);
    if (f?.kind === "choice") return markField(m.opts, f) as UnitKind;
  }
  return k.unit;
}

/** every face a mark may wear — what a panel carves up front */
export const MARK_UNITS: readonly UnitKind[] = [
  ...new Set(
    MARK_KINDS.flatMap((k) => {
      const f = k.unitField ? k.fields.find((x) => x.key === k.unitField) : null;
      return f?.kind === "choice"
        ? [k.unit, ...f.choices.map((c) => c.value as UnitKind)]
        : [k.unit];
    }),
  ),
];

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
