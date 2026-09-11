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
  spectre: "/sprites/turrets/spectre.png",
  meltdown: "/sprites/turrets/meltdown.png",
  foreshadow: `${T}/foreshadow.png`,
};

export const structIcon = (kind: TowerKind): string => TOWER_ICONS[kind];
