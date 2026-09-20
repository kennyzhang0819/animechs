import { foundryBaseUrl, foundryHeadUrl } from "./foundryArt";
import { FOUNDRY_ART } from "./turretFlag";
import type { TowerKind } from "./types";

const T = "/mindustry/sprites/blocks/turrets";

/**
 * Every turret's palette sprite — the build card, the editor and the
 * progress screen share it.
 *
 * THE VALUES ARE STOCK FILENAMES AND THE KEYS ARE OURS. This is the
 * fallback the game draws with FOUNDRY_ART off, so every path points into
 * the vendored tree (`public/mindustry`), which is upstream's and is left
 * spelled upstream's way; nothing else in the game is.
 */
export const TOWER_ICONS: Record<TowerKind, string> = {
  tacker: `${T}/duo/duo-preview.png`,
  lobber: `${T}/hail.png`,
  autocannon: `${T}/salvo/salvo-preview.png`,
  airburst: `${T}/scatter/scatter-preview.png`,
  cleaver: `${T}/fuse.png`,
  torch: `${T}/scorch.png`,
  coil: `${T}/arc.png`,
  piercer: `${T}/lancer.png`,
  barrage: `${T}/ripple.png`,
  douser: `${T}/wave.png`,
  deluge: `${T}/tsunami.png`,
  tether: `/mindustry/sprites/blocks/defense/parallax.png`,
  // the support pair is filed under defense with tether, not turrets
  fixer: `/mindustry/sprites/blocks/defense/mender.png`,
  restorer: `/mindustry/sprites/blocks/defense/mend-projector.png`,
  hive: `${T}/swarmer.png`,
  whirl: `${T}/cyclone/cyclone-preview.png`,
  repeater: `${T}/spectre.png`,
  furnace: `${T}/meltdown.png`,
  railhead: `${T}/foreshadow.png`,
  // the toxin line is authored art with no block behind it (turretArt.ts),
  // so with the flag off these four borrow the nearest stock silhouette
  duster: `${T}/scorch.png`,
  blighter: `${T}/hail.png`,
  drifter: `${T}/tsunami.png`,
  stinger: `${T}/salvo/salvo-preview.png`,
  // THE GARRISON'S FOUR POINT AT NOTHING, and that is not an omission.
  // Every other value here is a vendored Mindustry file, which is the
  // fallback for a head this game did not draw; these four ARE drawn
  // (wardenArt.ts) and are carved off the packed sheet instead
  // (atlas.ts towerIcon). Borrowing somebody else's sprite for one would
  // put a turret in the picture that is not the turret on the board.
  bulwark: "",
  lance: "",
  halberd: "",
  juggernaut: "",
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
