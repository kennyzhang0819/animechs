import { applyRungOverrides, type RungKnobs } from "./ladder";
import { applyOverrides } from "./tech";

/**
 * The balance document: the price knobs (base, growth) per turret, plus
 * the per-rung dials (enemy level, shield scale, swarm armour bonus) under
 * the reserved `difficulties` key — no turret is named that, so the flat
 * shape survives. Inside that section a rung is keyed by its 1-based
 * ORDINAL, "1" through "10" (rungKey in ladder.ts); the key was the
 * difficulty's name back when rungs had names.
 *
 * It exists so the dial can be turned WITHOUT a rebuild. The admin dashboard
 * writes it, the game reads it at startup, and a node missing from it simply
 * keeps the coefficient tech.ts authored. Finding a good number is an
 * afternoon of small edits and re-runs, and recompiling between each one is
 * how that afternoon becomes a week.
 *
 * The document is an OVERRIDE LAYER, never the source of truth. Once a
 * coefficient is settled it belongs in the node in tech.ts — or the rung's
 * row in ladder.ts — where it is read alongside the reasoning
 * for it; this file is the scratch pad in between.
 */
export interface BalanceDoc {
  [node: string]:
    | Partial<import("./tech").Knobs>
    | Record<string, Partial<RungKnobs>>
    | undefined;
  difficulties?: Record<string, Partial<RungKnobs>>;
}

/** where the document lives, served straight out of public/ */
const DOC_URL = "/balance.json";

/**
 * Read the saved coefficients over the authored ones.
 *
 * NEVER REJECTS, for the same reason loadLevelDocs does not: this is called
 * from the game's startup Promise.all, and a missing or mangled balance file
 * must cost the player nothing worse than the shipped numbers. A ship of
 * public/balance.json holding an empty object keeps the fetch off the
 * 404 path in the common case.
 */
export async function loadBalanceDoc(): Promise<void> {
  try {
    const res = await fetch(DOC_URL, { cache: "no-store" });
    if (!res.ok) return;
    const parsed = (await res.json()) as unknown;
    if (!parsed || typeof parsed !== "object") return;
    const { difficulties, ...towers } = parsed as BalanceDoc;
    applyOverrides(towers as Record<string, Partial<import("./tech").Knobs>>);
    applyRungOverrides(
      difficulties && typeof difficulties === "object" ? difficulties : {},
    );
  } catch {
    // offline, or a half-written file mid-save: the authored numbers stand
  }
}

/**
 * Persist the coefficients now in force. Returns false rather than throwing
 * so the dashboard can say "not saved" without losing the edit on screen.
 */
export async function saveBalanceDoc(doc: BalanceDoc): Promise<boolean> {
  try {
    const res = await fetch("/api/balance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
    return res.ok;
  } catch {
    return false;
  }
}
