// Art-style presets the renderer draws under. Concept stage: docs/style-concepts.html, rendered by scripts/style-shots.mjs

export type ArtStyleName = "base" | "inked" | "chunky" | "retro" | "retroNative" | "crt" | "tilt" | "inkedTilt" | "block" | "vox";

export interface ArtStyle {
  /** a dark rim round every sprite, in sheet px; 0 is none */
  outline: number;
  outlineColor: readonly [number, number, number];
  /** the frame snapped to k×k device px blocks; 1 is off */
  pixel: number;
  /** quantise the frame to these colours (32 at most), with ordered dither at `dither` */
  palette: readonly string[] | null;
  dither: number;
  /** darken the last device row of every block */
  scan: number;
  vignette: number;
  sat: number;
  contrast: number;
  /** a face under every wall's south edge, in cells; 0 is none */
  wallFace: number;
  /** multiplier on the drop-shadow throw of bodies, props and the core */
  shadowElev: number;
  /** y-scale on everything that stands (the dynamic batch); 1 is off */
  squash: number;
  /** a turret head drawn this far up its pad, as a share of its size */
  headLift: number;
  /** a dark rim along every rock mass's outline, as a width in coverage (0..0.5); 0 is none */
  rockEdge: number;
}

const BASE: ArtStyle = {
  outline: 0, outlineColor: [0.08, 0.08, 0.12], pixel: 1, palette: null, dither: 0, scan: 0, vignette: 0,
  sat: 1, contrast: 1, wallFace: 0, shadowElev: 1, squash: 1, headLift: 0, rockEdge: 0,
};

/** the game's own colours, 32 of them: clustered off a frame (scripts/style-shots.mjs --sample-palette) plus the family accents */
export const PALETTE_NATIVE: readonly string[] = [
  "#4b6a36", "#576d3c", "#7b9054", "#77a957", "#52412b", "#6d4d30", "#98744c", "#c88659",
  "#e38037", "#bbaa8b", "#ddd5d0", "#f4f4f4", "#c1c3d4", "#707379", "#575a5d", "#2e3239",
  "#1c4355", "#2b5f73", "#4e57a0", "#88a4ff", "#a9d8ff", "#edba4d", "#ffdd55", "#ec7458",
  "#db401c", "#62ae7f", "#84f491", "#d4ff3a", "#b48cff", "#ff5fd6", "#4dffe0", "#e8b796",
];

/** Endesga 32 */
export const PALETTE_ENDESGA: readonly string[] = [
  "#be4a2f", "#d77643", "#ead4aa", "#e4a672", "#b86f50", "#733e39", "#3e2731", "#a22633",
  "#e43b44", "#f77622", "#feae34", "#fee761", "#63c74d", "#3e8948", "#265c42", "#193c3e",
  "#124e89", "#0099db", "#2ce8f5", "#ffffff", "#c0cbdc", "#8b9bb4", "#5a6988", "#3a4466",
  "#262b44", "#181425", "#ff0044", "#68386c", "#b55088", "#f6757a", "#e8b796", "#c28569",
];

export const ART_STYLES: Record<ArtStyleName, ArtStyle> = {
  base: BASE,
  inked: { ...BASE, outline: 1, contrast: 1.06 },
  chunky: { ...BASE, outline: 1, pixel: 2, contrast: 1.04 },
  retro: { ...BASE, outline: 1, pixel: 2, palette: PALETTE_ENDESGA, dither: 0.8 },
  retroNative: { ...BASE, outline: 1, pixel: 2, palette: PALETTE_NATIVE, dither: 0.8 },
  crt: { ...BASE, pixel: 2, scan: 0.35, vignette: 0.45, sat: 1.2, contrast: 1.08 },
  tilt: { ...BASE, wallFace: 0.5, shadowElev: 2.6, squash: 0.9, headLift: 0.1 },
  inkedTilt: { ...BASE, outline: 1, wallFace: 0.5, shadowElev: 2.6, squash: 0.9, headLift: 0.1, contrast: 1.06 },
  /** the renderer's half of the block pixel style (pixelStyle.ts): the art is re-pixelled at pack time */
  block: { ...BASE, wallFace: 0.4, rockEdge: 0.08, shadowElev: 1.6 },
  /** the renderer's half of the 2.5D set (pixelStyle.ts isVox): the cliff face pass is the strip's */
  vox: { ...BASE, wallFace: 0.9, rockEdge: 0.05 },
};

export const artStyle: { name: ArtStyleName; current: ArtStyle } = { name: "base", current: BASE };

export function setArtStyle(name: ArtStyleName): ArtStyle {
  artStyle.name = name;
  artStyle.current = ART_STYLES[name] ?? BASE;
  return artStyle.current;
}

export function postOn(s: ArtStyle): boolean {
  return s.pixel > 1 || s.palette !== null || s.scan > 0 || s.vignette > 0 || s.sat !== 1 || s.contrast !== 1;
}
