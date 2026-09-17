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

/** what shape of thing an author places */
export type MarkGeom = "point";

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
  | { key: string; label: string; kind: "waves"; def: string };

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

export const MARK_KINDS: readonly MarkKind[] = [BUFF_TOWER];

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
