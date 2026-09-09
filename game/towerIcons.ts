import { MISSION_STRUCT_KINDS, type MissionStructKind, type StructKind, type TowerKind } from "./types";

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
  // the two repainted heads (see atlas.ts SRC): the menu has to show the
  // gun the board will show, so it reads the same derived art
  spectre: "/sprites/turrets/spectre.png",
  meltdown: "/sprites/turrets/meltdown.png",
  foreshadow: `${T}/foreshadow.png`,
  drill: "/mindustry/sprites/blocks/drills/pneumatic-drill.png",
  "factory-t1": "/mindustry/sprites/blocks/units/ground-factory.png",
  "factory-t2": "/mindustry/sprites/blocks/units/additive-reconstructor.png",
  "factory-t3": "/mindustry/sprites/blocks/units/multiplicative-reconstructor.png",
  "factory-t4": "/mindustry/sprites/blocks/units/exponential-reconstructor.png",
  "factory-t5": "/mindustry/sprites/blocks/units/tetrative-reconstructor.png",
};

/**
 * ...and one per MISSION BUILDING (types.ts MISSION_STRUCT_KINDS), the
 * swarm's own second roster. Same job as the table above — the map
 * editor's palette swatch and the plate it draws on the board — kept
 * apart for the same reason the stats are: nothing about a mission
 * building belongs in a record the build menu and the tech tree read.
 */
export const MISSION_STRUCT_ICONS: Record<MissionStructKind, string> = {
  "launch-pad": "/mindustry/sprites/blocks/campaign/launch-pad.png",
};

/** the menu sprite for any structure kind, off whichever roster owns it —
 *  the one lookup the editor and anything else that draws a kind can use */
export const structIcon = (kind: StructKind): string =>
  (MISSION_STRUCT_KINDS as readonly string[]).includes(kind) ?
    MISSION_STRUCT_ICONS[kind as MissionStructKind]
  : TOWER_ICONS[kind as TowerKind];
