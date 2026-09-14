/**
 * FOUNDRY'S ART, AS IT SHIPS: the heads and the core the game actually
 * draws, by URL.
 *
 * The drawings are AUTHORED AS PNGs in `docs/turret-concepts/` — generated
 * once by `scripts/turret-concepts.mjs` from the code in `turretArt.ts`,
 * then edited by hand — so the PNG is the source of truth and the code is
 * the thing that seeded it. `npm run sync:art` copies the sheet into
 * `public/foundry/`, which is what these URLs point at; it runs before
 * every dev server and every build, so an edit to the sheet is on the
 * board the next time the page loads.
 *
 * Every sprite is at its native size, 32 px a tile: 32, 64, 96, 128 for a
 * 1x1 to a 4x4, and the core at the nucleus's 160. A head faces +x, the
 * heading the renderer spins it from. `atlas.ts` packs them over the stock
 * turret cells while `FOUNDRY_ART` (`turretFlag.ts`) is on; the HUD's
 * pictures (`towerIcon`) and the placement ghost (`towerGhostIcon`) take
 * the same files, so every picture of a turret comes off one drawing.
 *
 * The menders have no drawing and keep their stock sprites — hence the
 * Partial: a lookup that misses is the fallback, not a bug.
 */
import type { TowerKind } from "./types";

const F = "/foundry";

/** the core, at the nucleus's 160 px */
export const FOUNDRY_CORE_URL = `${F}/core.png`;

/**
 * THE PLATE A HEAD STANDS ON, one per footprint in cells. These are
 * Mindustry's block-N already darkened on the sheet, so nothing darkens
 * them a second time — the `BASE_DARK` multiply that used to happen at
 * pack time is baked into the file.
 */
export const FOUNDRY_BASE_URLS: readonly string[] = [
  `${F}/base-1.png`,
  `${F}/base-2.png`,
  `${F}/base-3.png`,
  `${F}/base-4.png`,
];
/** the plate for a footprint this many cells on a side, clamped to the four that exist */
export const foundryBaseUrl = (size: number): string =>
  FOUNDRY_BASE_URLS[Math.min(FOUNDRY_BASE_URLS.length, Math.max(1, Math.floor(size))) - 1];

/** every kind's head, or absent where the kind has no Foundry drawing */
export const FOUNDRY_HEAD_URLS: Readonly<Partial<Record<TowerKind, string>>> = {
  duo: `${F}/duo.png`,
  hail: `${F}/hail.png`,
  scorch: `${F}/scorch.png`,
  arc: `${F}/arc.png`,
  salvo: `${F}/salvo.png`,
  scatter: `${F}/scatter.png`,
  lancer: `${F}/lancer.png`,
  wave: `${F}/wave.png`,
  parallax: `${F}/parallax.png`,
  swarmer: `${F}/swarmer.png`,
  fuse: `${F}/fuse.png`,
  ripple: `${F}/ripple.png`,
  tsunami: `${F}/tsunami.png`,
  cyclone: `${F}/cyclone.png`,
  spectre: `${F}/spectre.png`,
  meltdown: `${F}/meltdown.png`,
  foreshadow: `${F}/foreshadow.png`,
};

/** the head's file for a kind, or null where there is none */
export const foundryHeadUrl = (kind: TowerKind): string | null => FOUNDRY_HEAD_URLS[kind] ?? null;
