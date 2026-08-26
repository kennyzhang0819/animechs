import { BASE, COLS, NCELLS, ROWS } from "./constants";
import { WALL_PINE, type Prop, type Terrain } from "./terrain";

/**
 * Serializable map document — the game's OFFICIAL maps, one JSON file per
 * map under public/maps/. The map editor saves straight back into those
 * files (through the dev-only /api/maps route), so an edit IS the map:
 * the sim loads the same document.
 *
 * The documents deliberately live OUTSIDE the bundler's module graph and
 * are fetched at startup (loadOfficialMaps), never imported: an imported
 * JSON made every editor save a Turbopack HMR update, which its runtime
 * cannot hot-apply ("Expected module to match pattern" errors).
 */
export interface MapData {
  id: string;
  name: string;
  floor: number[]; // NCELLS, UV_FLOORS index
  wall: number[]; // NCELLS, UV_WALLS index or WALL_PINE where blocked
  blocked: number[]; // NCELLS, 0/1
  // NCELLS — enemy spawn pads by region: 0 = no pad, N >= 1 = a pad in
  // spawn region N. Level scripts pin wave groups to a region
  // ({ region: 2, mace: 50 } spawns only on region-2 pads), so legacy 0/1
  // documents read unchanged as one region-1 area. Absent in maps saved
  // before the layer existed; terrainFromMap synthesizes the legacy
  // western strip then
  spawn?: number[];
  pines: Prop[];
  decor: Prop[];
  // carved-valley centerline per column — generator metadata the sim's
  // seed-tower search reads; older documents fall back to a flat line
  valleyY?: number[];
}

/** every playable map — add a JSON under public/maps/ and list its id here */
export const OFFICIAL_MAP_IDS: readonly string[] = ["generated-24"];

/**
 * The loaded official map documents, in OFFICIAL_MAP_IDS order. Empty until
 * loadOfficialMaps() resolves — Game.create and the admin page both await
 * it before anything reads a map.
 */
export const OFFICIAL_MAPS: MapData[] = [];

/** fetch (or re-fetch) every official map document into OFFICIAL_MAPS */
export async function loadOfficialMaps(): Promise<MapData[]> {
  const maps = await Promise.all(
    OFFICIAL_MAP_IDS.map(async (id) => {
      const res = await fetch(`/maps/${id}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`failed to load official map "${id}" (${res.status})`);
      return (await res.json()) as MapData;
    }),
  );
  OFFICIAL_MAPS.length = 0;
  OFFICIAL_MAPS.push(...maps);
  return OFFICIAL_MAPS;
}

// ---------- palette ----------

export type PaintKind = "floor" | "wall" | "pine" | "decor" | "spawn" | "erase";

/**
 * One paintable entry: a set of interchangeable variants. With randomize ON
 * the editor picks a random variant (and a random quarter-turn for props)
 * per painted cell; with it OFF the user picks the exact variant.
 * The variants index into UV_FLOORS / UV_WALLS / UV_DECOR — the palette is
 * exactly what the atlas bakes in (extend atlas.ts to grow it).
 */
export interface PaletteSet {
  id: string;
  label: string;
  kind: PaintKind;
  variants: number[];
  icons: string[]; // sprite url per variant, for the picker UI
  // variants that mean different things (spawn regions) rather than
  // interchangeable art: the picker always shows them all and randomize
  // never applies
  noRandom?: boolean;
}

/**
 * Editor display colors per spawn region (index = region id - 1, cycling
 * past the end): `tint` multiplies the pad sprite in the editor's terrain
 * pass, `css` colors the picker's region badge, `tone` paints thumbnails.
 * Region 1 keeps the pad art's native look, so old maps draw unchanged.
 */
export const SPAWN_REGIONS: readonly {
  tint: readonly [number, number, number];
  css: string;
  tone: string;
}[] = [
  { tint: [1, 1, 1], css: "#E0757F", tone: "#8a3a44" },
  { tint: [0.5, 1.6, 1.9], css: "#5BD9E8", tone: "#2f6d78" },
  { tint: [0.55, 1.7, 0.7], css: "#7BE0A8", tone: "#2f7846" },
  { tint: [1.5, 0.75, 1.9], css: "#C77BFF", tone: "#6d3a8a" },
];

const ENV = "/mindustry/sprites/blocks/environment";
const PROPS = "/mindustry/sprites/blocks/props";

export const PALETTE: readonly PaletteSet[] = [
  { id: "grass", label: "Grass", kind: "floor", variants: [0, 1, 2],
    icons: [1, 2, 3].map((n) => `${ENV}/grass${n}.png`) },
  { id: "stone", label: "Stone", kind: "floor", variants: [3, 4, 5],
    icons: [1, 2, 3].map((n) => `${ENV}/stone${n}.png`) },
  { id: "dirt", label: "Dirt", kind: "floor", variants: [6, 7, 8],
    icons: [1, 2, 3].map((n) => `${ENV}/dirt${n}.png`) },
  { id: "stone-wall", label: "Stone wall", kind: "wall", variants: [0, 1],
    icons: [1, 2].map((n) => `${ENV}/stone-wall${n}.png`) },
  { id: "dirt-wall", label: "Dirt wall", kind: "wall", variants: [2, 3],
    icons: [1, 2].map((n) => `${ENV}/dirt-wall${n}.png`) },
  { id: "pine", label: "Pine", kind: "pine", variants: [0], icons: [`${ENV}/pine.png`] },
  { id: "boulder", label: "Boulder", kind: "decor", variants: [0, 1],
    icons: [1, 2].map((n) => `${PROPS}/boulder${n}.png`) },
  { id: "shrub", label: "Shrub", kind: "decor", variants: [2], icons: [`${ENV}/shrubs1.png`] },
  // enemy spawn pads: a data layer — the pad tile shows in the editor only,
  // the game renders the floor beneath it. One variant per spawn region;
  // the variant value IS the region id written into the spawn layer
  { id: "spawn", label: "Spawn region", kind: "spawn", variants: [1, 2, 3, 4], noRandom: true,
    icons: SPAWN_REGIONS.map(() => `${ENV}/dark-panel-2.png`) },
  { id: "erase", label: "Erase", kind: "erase", variants: [0], icons: [`${ENV}/clear-editor.png`] },
];

// ---------- terrain <-> map ----------

export function mapFromTerrain(t: Terrain, id: string, name: string): MapData {
  return {
    id,
    name,
    floor: Array.from(t.floor),
    wall: Array.from(t.wall),
    blocked: Array.from(t.blocked),
    spawn: Array.from(t.spawn),
    pines: t.pines.map((p) => ({ ...p })),
    decor: t.decor.map((p) => ({ ...p })),
    valleyY: Array.from(t.valleyY).map((v) => Math.round(v * 100) / 100),
  };
}

/** pre-spawn-layer maps spawned on the open cells of the western strip */
function legacySpawn(blocked: Uint8Array): Uint8Array {
  const spawn = new Uint8Array(NCELLS);
  for (let y = 1; y < ROWS - 1; y++)
    for (let x = 0; x < 6; x++) {
      const i = y * COLS + x;
      if (!blocked[i]) spawn[i] = 1;
    }
  return spawn;
}

export function terrainFromMap(m: MapData): Terrain {
  const blocked = Uint8Array.from(m.blocked);
  return {
    floor: Uint8Array.from(m.floor),
    wall: Uint8Array.from(m.wall),
    blocked,
    spawn: m.spawn ? Uint8Array.from(m.spawn) : legacySpawn(blocked),
    pines: m.pines.map((p) => ({ ...p })),
    decor: m.decor.map((p) => ({ ...p })),
    valleyY: m.valleyY
      ? Float32Array.from(m.valleyY)
      : new Float32Array(COLS).fill(BASE.y + BASE.size / 2),
  };
}

// ---------- storage ----------

export function loadMap(id: string): MapData | null {
  return OFFICIAL_MAPS.find((m) => m.id === id) ?? null;
}

/**
 * Persist an official map: the dev server writes the JSON document back to
 * public/maps/<id>.json. The game plays the new world on its next page
 * load (Game.create re-fetches the documents). Resolves false when saving
 * failed (production build, bad response).
 */
export async function saveMap(map: MapData): Promise<boolean> {
  try {
    const res = await fetch("/api/maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(map),
    });
    if (!res.ok) return false;
    // keep the in-memory documents current so admin thumbnails match
    const at = OFFICIAL_MAPS.findIndex((m) => m.id === map.id);
    if (at >= 0) OFFICIAL_MAPS[at] = map;
    return true;
  } catch {
    return false;
  }
}

// ---------- thumbnails ----------

/** per-cell preview colors, mirroring the atlas art's average tones */
const FLOOR_TONES = ["#7ab648", "#74ae45", "#6ea843", "#8a8a93", "#84848d", "#7e7e87", "#a5764f", "#9e7049", "#976a44"];
const WALL_TONES = ["#5c5c66", "#565660", "#6e4f35", "#674a32"];
const PINE_TONE = "#2e6e35";

/** paint a MapData into a canvas at 1px per cell (scale it up with CSS) */
export function drawThumb(map: MapData, canvas: HTMLCanvasElement): void {
  canvas.width = COLS;
  canvas.height = ROWS;
  const c = canvas.getContext("2d");
  if (!c) return;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      c.fillStyle = map.blocked[i]
        ? map.wall[i] === WALL_PINE
          ? PINE_TONE
          : WALL_TONES[map.wall[i]] ?? WALL_TONES[0]
        : map.spawn?.[i]
          ? SPAWN_REGIONS[(map.spawn[i] - 1) % SPAWN_REGIONS.length].tone
          : FLOOR_TONES[map.floor[i]] ?? FLOOR_TONES[0];
      c.fillRect(x, y, 1, 1);
    }
  // core marker
  c.fillStyle = "#ffd37f";
  c.fillRect(BASE.x, BASE.y, BASE.size, BASE.size);
}
