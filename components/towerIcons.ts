import type { TowerKind } from "@/game/types";

const T = "/mindustry/sprites/blocks/turrets";

/** raw menu sprite per tower, shared by the build menu and the tech tree */
export const TOWER_ICONS: Record<TowerKind, string> = {
  duo: `${T}/duo/duo-preview.png`,
  hail: `${T}/hail.png`,
  salvo: `${T}/salvo/salvo-preview.png`,
  scatter: `${T}/scatter/scatter-preview.png`,
  fuse: `${T}/fuse.png`,
  scorch: `${T}/scorch.png`,
  // Parallax ships under blocks/defense rather than blocks/turrets in the
  // source atlas — Mindustry classes it with the support blocks
  arc: `${T}/arc.png`,
  lancer: `${T}/lancer.png`,
  ripple: `${T}/ripple.png`,
  parallax: `/mindustry/sprites/blocks/defense/parallax.png`,
  swarmer: `${T}/swarmer.png`,
  cyclone: `${T}/cyclone/cyclone-preview.png`,
  spectre: `${T}/spectre.png`,
  meltdown: `${T}/meltdown.png`,
  foreshadow: `${T}/foreshadow.png`,
};
