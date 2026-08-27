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
};
