import { toCanvas } from "./animalArt";
import { turretHead } from "./turretArt";
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
 *  four that exist — exactly the renderer's own pick */
export const towerBaseIcon = (size: number): string =>
  TOWER_BASES[Math.min(TOWER_BASES.length, Math.max(1, Math.floor(size))) - 1];

const GHOST_HEADS = new Map<string, string>();
/**
 * THE GHOST'S HEAD for one kind: the Foundry drawing (turretArt.ts) as
 * a data URL, raw and unoutlined like the stock file the ghost used to
 * load, or that stock file's path where a kind has no drawing or the
 * flag is off. Drawn once per kind and kept; needs a document, so on the
 * server (a static export's prerender) it is the stock path — the ghost
 * only ever draws on the client.
 */
export function towerGhostIcon(kind: TowerKind): string {
  if (typeof document === "undefined") return TOWER_ICONS[kind];
  let url = GHOST_HEADS.get(kind);
  if (!url) {
    const head = FOUNDRY_ART ? turretHead(kind) : null;
    url = head ? toCanvas(head).toDataURL() : TOWER_ICONS[kind];
    GHOST_HEADS.set(kind, url);
  }
  return url;
}
