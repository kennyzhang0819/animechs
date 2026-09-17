import { allScrapPriceOverrides, applyScrapPriceOverrides } from "./economy";
import { allHitboxOverrides, applyHitboxOverrides, type HitboxSpec } from "./hitbox";
import { allRungOverrides, applyRungOverrides, type RungKnobs } from "./ladder";
import { allChanceOverrides, applyChanceOverrides, MOD_ODDS } from "./mods";
import { allMutationCostOverrides, applyMutationCostOverrides } from "./mutation";
import { RELIC_ODDS } from "./relics";
import { TURRET_ODDS } from "./rarity";

/**
 * The balance document: three sections, each a dial the dashboard turns.
 *
 *   `prices`        what each turret costs IN SCRAP, keyed by turret kind
 *                   (scrapPriceOf in economy.ts) — the in-run economy's
 *                   only price list
 *   `difficulties`  the per-rung dials (enemy level, the mutator roll's
 *                   count and points, the XP bonus), keyed by a rung's
 *                   1-based ORDINAL, "1" through "10" (rungKey in ladder.ts)
 *   `hitboxes`      THE SHAPE OF EACH BODY — `long` nose to tail and
 *                   `wide` flank to flank, in px, keyed by unit kind
 *                   (hitbox.ts). The admin Hitboxes tab writes it, and a
 *                   kind missing from it is the circle its authored
 *                   radius makes
 *   `mutations`     what each mutator is WORTH, keyed by its catalog id
 *                   (mutationCostOf in mutation.ts) — the one dial that
 *                   decides which difficulties can afford which rules
 *   `rarities`      THE ODDS. The band tables the rolls are weighed
 *                   against — `turret` (rarity.ts), `mod` (mods.ts) and
 *                   `relic` (relics.ts) — and `chances`, the per-mod odds of
 *                   landing on one new turret (mods.ts ModDef.chance).
 *                   Five tables in one section because they are one
 *                   question asked five times: how often does the good
 *                   thing happen. `mod` and `relic` used to be a single
 *                   `module` key, from when the two categories shared one
 *                   dial; an old document's `module` is ignored like any
 *                   other retired key
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
  hitboxes?: Record<string, HitboxSpec>;
  mutations?: Record<string, number>;
  rarities?: {
    turret?: Record<string, number>;
    mod?: Record<string, number>;
    relic?: Record<string, number>;
    chances?: Record<string, number>;
  };
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
    const { prices, difficulties, hitboxes, mutations, rarities } = parsed as BalanceDoc;
    applyScrapPriceOverrides(prices && typeof prices === "object" ? prices : {});
    applyRungOverrides(
      difficulties && typeof difficulties === "object" ? difficulties : {},
    );
    applyMutationCostOverrides(
      mutations && typeof mutations === "object" ? mutations : {},
    );
    // THE SHAPES, and they have to land before any Sim is built: the
    // apply refills the tables the sim reads every tick (hitbox.ts), and
    // a shape dropped from the document goes back to its authored circle
    applyHitboxOverrides(hitboxes && typeof hitboxes === "object" ? hitboxes : {});
    // THE ODDS, all four tables. Each apply CLEARS what it held first, so
    // a band dropped from the document goes back to the authored weight
    // rather than lingering from the last load
    const odds = rarities && typeof rarities === "object" ? rarities : {};
    TURRET_ODDS.apply(odds.turret ?? {});
    MOD_ODDS.apply(odds.mod ?? {});
    RELIC_ODDS.apply(odds.relic ?? {});
    applyChanceOverrides(odds.chances ?? {});
  } catch {
    // offline, or a half-written file mid-save: the authored numbers stand
  }
}

/**
 * EVERYTHING BENT RIGHT NOW, as a document — gathered from the override
 * layers themselves rather than from whichever screen is asking.
 *
 * THE SAVE IS WHOLESALE. /api/balance writes public/balance.json outright,
 * so a screen that posted only its own section would delete every other
 * one: the rarities page would wipe the prices, and the prices page would
 * wipe the rarities back. Both call this, so whoever presses Save writes
 * the whole of what is bent and neither can lose the other's afternoon.
 *
 * A SECTION WITH NOTHING BENT IS LEFT OUT, so the file stays a list of
 * deliberate deviations rather than a dump of every authored number.
 */
export function currentBalanceDoc(): BalanceDoc {
  const doc: BalanceDoc = {};
  const prices = allScrapPriceOverrides();
  if (Object.keys(prices).length > 0) doc.prices = prices;
  const diffs = allRungOverrides();
  if (Object.keys(diffs).length > 0) doc.difficulties = diffs;
  const muts = allMutationCostOverrides();
  if (Object.keys(muts).length > 0) doc.mutations = muts;
  const boxes = allHitboxOverrides();
  if (Object.keys(boxes).length > 0) doc.hitboxes = boxes;
  const rarities: NonNullable<BalanceDoc["rarities"]> = {};
  const turret = TURRET_ODDS.overrides();
  if (Object.keys(turret).length > 0) rarities.turret = turret as Record<string, number>;
  const mod = MOD_ODDS.overrides();
  if (Object.keys(mod).length > 0) rarities.mod = mod as Record<string, number>;
  const relic = RELIC_ODDS.overrides();
  if (Object.keys(relic).length > 0) rarities.relic = relic as Record<string, number>;
  const chances = allChanceOverrides();
  if (Object.keys(chances).length > 0) rarities.chances = chances;
  if (Object.keys(rarities).length > 0) doc.rarities = rarities;
  return doc;
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
