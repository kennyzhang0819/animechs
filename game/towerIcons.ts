import { foundryBaseUrl, foundryHeadUrl } from "./foundryArt";
import { FOUNDRY_ART } from "./turretFlag";
import type { TowerKind } from "./types";

const T = "/mindustry/sprites/blocks/turrets";

/** every turret's palette sprite — the build card, the editor and the progress screen share it */
export const TOWER_ICONS: Record<TowerKind, string> = {
  duo: `${T}/duo/duo-preview.png`,
  hail: `${T}/hail.png`,
  salvo: `${T}/salvo/salvo-preview.png`,
  scatter: `${T}/scatter/scatter-preview.png`,
  fuse: `${T}/fuse.png`,
  scorch: `${T}/scorch.png`,
  arc: `${T}/arc.png`,
  lancer: `${T}/lancer.png`,
  ripple: `${T}/ripple.png`,
  wave: `${T}/wave.png`,
  tsunami: `${T}/tsunami.png`,
  parallax: `/mindustry/sprites/blocks/defense/parallax.png`,
  // the support pair is filed under defense with parallax, not turrets
  mender: `/mindustry/sprites/blocks/defense/mender.png`,
  mendProjector: `/mindustry/sprites/blocks/defense/mend-projector.png`,
  swarmer: `${T}/swarmer.png`,
  cyclone: `${T}/cyclone/cyclone-preview.png`,
  spectre: `${T}/spectre.png`,
  meltdown: `${T}/meltdown.png`,
  foreshadow: `${T}/foreshadow.png`,
};

export const structIcon = (kind: TowerKind): string => TOWER_ICONS[kind];

/**
 * THE PLATE A TURRET STANDS ON — Mindustry's block-N, one per footprint
 * in cells, and the same four the renderer packs into the atlas and
 * draws under every turret on the field (renderer.ts UV_TOWER_BASE*).
 *
 * The sprites above are the turret's TOP and nothing else (the four that
 * point at a `-preview` are the assembled head, still without ground
 * under it), so anything drawing a whole turret outside the WebGL pass —
 * the placement ghost — needs this half as well.
 */
const TOWER_BASES: readonly string[] = [
  `${T}/bases/block-1.png`,
  `${T}/bases/block-2.png`,
  `${T}/bases/block-3.png`,
  `${T}/bases/block-4.png`,
];

/** the plate for a footprint this many cells on a side, clamped to the
 *  four that exist — exactly the renderer's own pick. While the flag is on
 *  it is the sheet's plate (foundryArt.ts), which comes darkened, so the
 *  caller does not darken it again. */
export const towerBaseIcon = (size: number): string =>
  FOUNDRY_ART ?
    foundryBaseUrl(size)
  : TOWER_BASES[Math.min(TOWER_BASES.length, Math.max(1, Math.floor(size))) - 1];

/**
 * THE GHOST'S HEAD for one kind: the Foundry drawing's own file
 * (foundryArt.ts), raw and unoutlined like the stock file the ghost
 * loads, or that stock file where a kind has no drawing or the flag is
 * off. A path either way, because the ghost loads it as an image
 * (game.ts ghostSprite) — nothing here needs a document, so the server
 * side of a static export gets the same answer the browser does.
 */
export function towerGhostIcon(kind: TowerKind): string {
  return (FOUNDRY_ART ? foundryHeadUrl(kind) : null) ?? TOWER_ICONS[kind];
}
