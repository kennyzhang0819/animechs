import { applyScrapPriceOverrides } from "./economy";
import { applyRungOverrides, type RungKnobs } from "./ladder";
import { applyMutationCostOverrides } from "./mutation";

/**
 * The balance document: three sections, each a dial the dashboard turns.
 *
 *   `prices`        what each turret costs IN SCRAP, keyed by turret kind
 *                   (scrapPriceOf in economy.ts) — the in-run economy's
 *                   only price list
 *   `difficulties`  the per-rung dials (enemy level, the mutator roll's
 *                   count and points, the XP bonus), keyed by a rung's
 *                   1-based ORDINAL, "1" through "10" (rungKey in ladder.ts)
 *   `mutations`     what each mutator is WORTH, keyed by its catalog id
 *                   (mutationCostOf in mutation.ts) — the one dial that
 *                   decides which difficulties can afford which rules
 *
 * It exists so the dial can be turned WITHOUT a rebuild. The admin dashboard
 * writes it, the game reads it at startup, and a key missing from it simply
 * keeps the number the code authored. Finding a good number is an
 * afternoon of small edits and re-runs, and recompiling between each one is
 * how that afternoon becomes a week.
 *
 * The document is an OVERRIDE LAYER, never the source of truth. Once a
 * number is settled it belongs in TOWER_PRICE in economy.ts — or the
 * rung's row in ladder.ts — where it is read alongside the reasoning for
 * it; this file is the scratch pad in between.
 *
 * Older documents kept per-turret `{base, growth}` bundles at the top
 * level, from the five-currency tree. Those keys are ignored on load.
 */
export interface BalanceDoc {
  prices?: Record<string, number>;
  difficulties?: Record<string, Partial<RungKnobs>>;
  mutations?: Record<string, number>;
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
    const { prices, difficulties, mutations } = parsed as BalanceDoc;
    applyScrapPriceOverrides(prices && typeof prices === "object" ? prices : {});
    applyRungOverrides(
      difficulties && typeof difficulties === "object" ? difficulties : {},
    );
    applyMutationCostOverrides(
      mutations && typeof mutations === "object" ? mutations : {},
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
