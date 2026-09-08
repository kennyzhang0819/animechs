import type { TowerKind } from "./types";

const T = "/mindustry/sprites/blocks/turrets";

/** raw menu sprite per tower, shared by the build menu, the tech tree and
 *  the map editor. It lives on the game side (not under components/) so the
 *  headless transpile (scripts/playtest.mjs) keeps game/ as its root */
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
  // the liquid turrets' bare art — the menu shows the dry turret, the
  // atlas bakes the water into the placed one
  wave: `${T}/wave.png`,
  tsunami: `${T}/tsunami.png`,
  // Parallax ships under blocks/defense rather than blocks/turrets in the
  // source atlas — Mindustry classes it with the support blocks
  parallax: `/mindustry/sprites/blocks/defense/parallax.png`,
  swarmer: `${T}/swarmer.png`,
  cyclone: `${T}/cyclone/cyclone-preview.png`,
  spectre: `${T}/spectre.png`,
  meltdown: `${T}/meltdown.png`,
  foreshadow: `${T}/foreshadow.png`,
  "copper-wall": "/mindustry/sprites/blocks/walls/copper-wall.png",
  "titanium-wall": "/mindustry/sprites/blocks/walls/titanium-wall.png",
  "thorium-wall": "/mindustry/sprites/blocks/walls/thorium-wall.png",
  "copper-wall-large": "/mindustry/sprites/blocks/walls/copper-wall-large.png",
  "titanium-wall-large": "/mindustry/sprites/blocks/walls/titanium-wall-large.png",
  "thorium-wall-large": "/mindustry/sprites/blocks/walls/thorium-wall-large.png",
};
