import { structStats } from "./constants";
import { explain, type SaveResult, type StructurePlacement } from "./types";

/**
 * DEFENCE BLUEPRINTS — a formation of the swarm's buildings, authored ONCE
 * and stamped on as many maps as you like.
 *
 * The problem this solves is that an outpost is not one building. A duo
 * ring with a wall skirt is a dozen stamps that have to land in exactly
 * the right relationship to each other, and a map wants six of them; nine
 * maps want fifty. Placing that by hand is an afternoon, and CHANGING it —
 * a wall moved one cell, a duo swapped for a hail — is that afternoon
 * again, on every copy, with no way to tell which copies you missed.
 *
 * So a formation is a LIBRARY ENTRY and a map holds REFERENCES to it
 * (FormationPlacement). Every instance on every map is resolved from this
 * one document when the map is read, which is the whole trick: editing the
 * blueprint IS editing every instance, everywhere, at once. Nothing is
 * copied into a map that has to be kept in step, so nothing can fall out
 * of step.
 *
 * THE LIBRARY IS ONE DOCUMENT (public/blueprints.json) rather than one per
 * map, because a blueprint that lived on a map could not be stamped on
 * another one — which is the entire point of having them.
 *
 * A BLUEPRINT'S FOOTPRINT NEVER CHANGES after it is created. That is a
 * rule, not an observation, and it is what keeps this simple: an instance
 * is a box of a known size on a board that was authored around it, so
 * re-resolving one can never need to push a neighbour out of the way,
 * re-check an overlap, or decide what to do about ground that is no longer
 * free. Editing a blueprint changes what is INSIDE the box and never the
 * box. saveBlueprint refuses a replacement of a different size rather than
 * letting a resize through and dealing with the consequences on nine maps.
 */
export interface Blueprint {
  /** slug, stable for the life of the blueprint — the maps' reference */
  id: string;
  /** what the author calls it: "Duo Outpost", "Wall Skirt" */
  name: string;
  /**
   * THE FOOTPRINT, in cells — the box the author drew round it, fixed at
   * creation (see the note above). Parts do not have to fill it; the empty
   * margin is part of the blueprint, because it is what keeps two stamped
   * instances from sitting closer together than they were designed to.
   */
  w: number;
  h: number;
  /**
   * The buildings, with `gx, gy` RELATIVE to the box's top-left and
   * UNROTATED — the blueprint's own frame. A placed instance's rotation is
   * applied on the way out (expandFormation), never baked in here, so
   * every instance of a blueprint is the same blueprint however it is
   * turned.
   */
  parts: StructurePlacement[];
}

/**
 * ONE STAMPED INSTANCE, as a map document carries it (MapData.formations):
 * which blueprint, where its box's top-left corner sits, and how it is
 * turned. That is the whole record — the buildings are not in it, and that
 * is the point.
 */
export interface FormationPlacement {
  /** Blueprint.id. An instance whose blueprint is gone is DROPPED when the
   *  map is read (formationsOf), which is how deleting a blueprint deletes
   *  its instances everywhere without touching a single map document */
  id: string;
  /** top-left cell of the PLACED box — after rotation, so this is always
   *  the corner you see on the board */
  gx: number;
  gy: number;
  /** quarter-turns clockwise, 0 to 3 */
  rot: number;
}

/** the shape of public/blueprints.json */
export interface BlueprintDoc {
  blueprints: Blueprint[];
}

/**
 * THE LIBRARY AS LOADED. Empty until loadBlueprints() resolves — the same
 * contract OFFICIAL_MAPS has, and the same reason (a document fetched at
 * startup rather than imported, so an editor save is not an HMR update the
 * bundler cannot apply).
 *
 * A map read before this is populated resolves NO formations, so every
 * entry point that reads a map awaits both.
 */
export const BLUEPRINTS: Blueprint[] = [];

export const blueprintById = (id: string): Blueprint | null =>
  BLUEPRINTS.find((b) => b.id === id) ?? null;

/** fetch the library, bypassing the HTTP cache */
export async function loadBlueprints(): Promise<Blueprint[]> {
  let doc: BlueprintDoc;
  try {
    const res = await fetch("/blueprints.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status}`);
    doc = (await res.json()) as BlueprintDoc;
  } catch (err) {
    // A MISSING LIBRARY IS NOT A BROKEN GAME: every map still has its own
    // loose stamps, and a formation nobody can resolve is simply dropped.
    // Warn and carry on rather than refusing to start.
    console.warn("could not load the blueprint library — formations will not resolve", err);
    BLUEPRINTS.length = 0;
    return BLUEPRINTS;
  }
  BLUEPRINTS.length = 0;
  for (const b of doc.blueprints ?? []) if (validBlueprint(b)) BLUEPRINTS.push(b);
  return BLUEPRINTS;
}

/** a library entry this build can actually use — a hand-edited document's
 *  stray entry is dropped rather than crashing an editor or a run */
function validBlueprint(b: Blueprint): boolean {
  return (
    typeof b?.id === "string" &&
    /^[a-z0-9-]+$/.test(b.id) &&
    typeof b.name === "string" &&
    Number.isInteger(b.w) && b.w > 0 &&
    Number.isInteger(b.h) && b.h > 0 &&
    Array.isArray(b.parts)
  );
}

/** the id a name would take — lowercase, hyphens, nothing else */
export const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * THE BOX A PLACED INSTANCE COVERS. A quarter-turn swaps the axes, so a
 * 4x8 blueprint stamped at rot 1 is 8x4 on the board — every caller that
 * cares where an instance ENDS goes through this rather than reading the
 * blueprint's own w/h.
 */
export function placedSize(bp: Blueprint, rot: number): { w: number; h: number } {
  return (rot & 1) === 0 ? { w: bp.w, h: bp.h } : { w: bp.h, h: bp.w };
}

/**
 * ONE PART'S CELL IN A PLACED INSTANCE'S FRAME — the blueprint's own
 * (px, py) turned `rot` quarter-turns clockwise inside a w x h box.
 *
 * A footprint is a SQUARE of `sz` cells addressed by its top-left corner,
 * so turning it is not just turning its corner: the corner that was
 * top-left is the top-RIGHT one after a quarter turn, and the new top-left
 * is `sz - 1` cells back along the new x axis. That is where every
 * `- sz` below comes from, and getting it wrong shifts a rotated formation
 * by a building's width in a way that looks almost right.
 *
 * Nothing here turns the BUILDING. A turret in this game has no authored
 * facing — a placed one is aimed at the core it was built against
 * (Sim.addTower) — so a rotated blueprint is a rotated LAYOUT and every
 * gun in it still points wherever it would have pointed.
 */
export function rotatePart(
  bp: Blueprint,
  rot: number,
  px: number,
  py: number,
  sz: number,
): { x: number; y: number } {
  switch (rot & 3) {
    case 1:
      return { x: bp.h - py - sz, y: px };
    case 2:
      return { x: bp.w - px - sz, y: bp.h - py - sz };
    case 3:
      return { x: py, y: bp.w - px - sz };
    default:
      return { x: px, y: py };
  }
}

/** the inverse of rotatePart: a cell in a PLACED instance's frame back into
 *  the blueprint's own. This is what saving an edited instance needs — the
 *  author moved things around on a board that was turned, and the library
 *  keeps one canonical unrotated layout */
export function unrotatePart(
  bp: Blueprint,
  rot: number,
  x: number,
  y: number,
  sz: number,
): { x: number; y: number } {
  // turning back is turning forward by whatever is left of the circle, in
  // the PLACED box, whose axes are swapped on an odd turn
  const box = placedSize(bp, rot);
  switch (rot & 3) {
    case 1:
      return { x: y, y: box.w - x - sz };
    case 2:
      return { x: bp.w - x - sz, y: bp.h - y - sz };
    case 3:
      return { x: box.h - y - sz, y: x };
    default:
      return { x, y };
  }
}

/**
 * ONE INSTANCE, AS BUILDINGS ON THE BOARD — the blueprint's parts turned
 * and moved into absolute cells. This is the ONLY place an instance
 * becomes structures, and every reader goes through it: the sim stands
 * them up from here, the editor draws and overlap-tests them from here, so
 * what a run fights is exactly what the editor drew.
 *
 * An instance whose blueprint is gone expands to nothing.
 */
export function expandFormation(inst: FormationPlacement): StructurePlacement[] {
  const bp = blueprintById(inst.id);
  if (!bp) return [];
  return bp.parts.map((p) => {
    const sz = structStats(p.kind).size;
    const r = rotatePart(bp, inst.rot, p.gx, p.gy, sz);
    return { kind: p.kind, gx: inst.gx + r.x, gy: inst.gy + r.y };
  });
}

/** every building every instance on a board puts down, in one list */
export function expandFormations(list: readonly FormationPlacement[]): StructurePlacement[] {
  return list.flatMap(expandFormation);
}

/**
 * Persist the library. The dev route writes public/blueprints.json and, on
 * a DELETE, sweeps the removed ids out of every map document — see the
 * route for why that sweep is server-side.
 *
 * `deleted` is the ids that were in the library and are not any more.
 * Passing them explicitly rather than having the server diff means the
 * sweep happens for exactly the entries the author meant to remove, and
 * never as a side effect of a document that arrived short.
 */
export async function saveBlueprints(deleted: readonly string[] = []): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch("/api/blueprints", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blueprints: BLUEPRINTS, deleted }),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `could not reach the dev server (${why})` };
  }
  if (!res.ok) return { ok: false, error: await explain(res) };
  return { ok: true };
}

/**
 * ADD OR REPLACE A LIBRARY ENTRY, in memory — the caller saves.
 *
 * A REPLACEMENT MUST BE THE SAME SIZE. Every map that stamped this
 * blueprint was authored around the box it drew, and a resize would move
 * every instance's far edge on nine maps at once with nothing to check it
 * against. The rule is stated in Blueprint's own note; this is where it is
 * enforced, and refusing is the whole of the enforcement — there is no
 * resize path to get right because there is no resize.
 */
export function putBlueprint(bp: Blueprint): SaveResult {
  const at = BLUEPRINTS.findIndex((b) => b.id === bp.id);
  if (at >= 0) {
    const old = BLUEPRINTS[at];
    if (old.w !== bp.w || old.h !== bp.h)
      return {
        ok: false,
        error:
          `"${old.name}" is ${old.w}x${old.h} and this selection is ${bp.w}x${bp.h}. ` +
          "A blueprint's footprint is fixed once it is created — draw the box the same size, " +
          "or save this as a new formation.",
      };
    BLUEPRINTS[at] = bp;
    return { ok: true };
  }
  BLUEPRINTS.push(bp);
  return { ok: true };
}

/** drop a library entry. Its instances go with it, everywhere: the sweep
 *  in the API route takes them out of the map documents, and any that
 *  survive in a stale document are dropped when that map is read */
export function removeBlueprint(id: string): void {
  const at = BLUEPRINTS.findIndex((b) => b.id === id);
  if (at >= 0) BLUEPRINTS.splice(at, 1);
}
