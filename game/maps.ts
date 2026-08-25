import { BASE, COLS, NCELLS, ROWS } from "./constants";
import { generateTerrain, WALL_PINE, type Prop, type Terrain } from "./terrain";

/**
 * Serializable map snapshot — the editor's document format. Stored in
 * localStorage; convertible to/from the game's Terrain.
 */
export interface MapData {
  id: string;
  name: string;
  floor: number[]; // NCELLS, UV_FLOORS index
  wall: number[]; // NCELLS, UV_WALLS index or WALL_PINE where blocked
  blocked: number[]; // NCELLS, 0/1
  // NCELLS, 0/1 — enemy spawn pads. Absent in maps saved before the layer
  // existed; terrainFromMap synthesizes the legacy western strip then
  spawn?: number[];
  pines: Prop[];
  decor: Prop[];
}

/** the generated map's pinned seed — mirrors MAP_SEED in sim.ts */
export const GENERATED_SEED = 24;
export const GENERATED_ID = "generated-24";

const LS_KEY = "swarmfield.maps.v1";

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
}

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
  // enemy spawn pad: a data layer — the pad tile shows in the editor only,
  // the game renders the floor beneath it
  { id: "spawn", label: "Spawn pad", kind: "spawn", variants: [0], icons: [`${ENV}/dark-panel-2.png`] },
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
    // editor maps carry no carved-valley metadata; a flat centerline keeps
    // Terrain consumers (seedTower's search) sane if one ever loads this
    valleyY: new Float32Array(COLS).fill(BASE.y + BASE.size / 2),
  };
}

/** the game's pinned generated world, as an editable document */
export function generatedMap(): MapData {
  return mapFromTerrain(
    generateTerrain(GENERATED_SEED),
    GENERATED_ID,
    `Seed ${GENERATED_SEED} — generated`,
  );
}

/** empty grass field ringed by stone wall, spawn pads along the west side */
export function blankMap(name: string): MapData {
  const floor = new Array<number>(NCELLS);
  const wall = new Array<number>(NCELLS).fill(0);
  const blocked = new Array<number>(NCELLS).fill(0);
  const spawn = new Array<number>(NCELLS).fill(0);
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      floor[i] = (Math.random() * 3) | 0;
      if (x < 2 || y < 2 || x >= COLS - 2 || y >= ROWS - 2) {
        blocked[i] = 1;
        wall[i] = (Math.random() * 2) | 0;
      } else if (x < 5) {
        spawn[i] = 1;
      }
    }
  return { id: `map-${Date.now().toString(36)}`, name, floor, wall, blocked, spawn, pines: [], decor: [] };
}

// ---------- storage ----------

function readStore(): MapData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as MapData[]) : [];
  } catch {
    return [];
  }
}

function writeStore(maps: MapData[]): void {
  window.localStorage.setItem(LS_KEY, JSON.stringify(maps));
}

/** custom maps only — the generated map is prepended by the admin page */
export function listCustomMaps(): MapData[] {
  return readStore();
}

export function loadMap(id: string): MapData | null {
  if (id === GENERATED_ID) return generatedMap();
  return readStore().find((m) => m.id === id) ?? null;
}

/**
 * Persist a map. Saving the generated map forks it into a custom copy
 * (the generated one always rebuilds from its seed) — returns the stored id.
 */
export function saveMap(map: MapData): string {
  const maps = readStore();
  let stored = map;
  if (map.id === GENERATED_ID) {
    stored = { ...map, id: `map-${Date.now().toString(36)}`, name: `Seed ${GENERATED_SEED} — edited` };
  }
  const at = maps.findIndex((m) => m.id === stored.id);
  if (at >= 0) maps[at] = stored;
  else maps.push(stored);
  writeStore(maps);
  return stored.id;
}

export function deleteMap(id: string): void {
  writeStore(readStore().filter((m) => m.id !== id));
}

// ---------- thumbnails ----------

/** per-cell preview colors, mirroring the atlas art's average tones */
const FLOOR_TONES = ["#7ab648", "#74ae45", "#6ea843", "#8a8a93", "#84848d", "#7e7e87", "#a5764f", "#9e7049", "#976a44"];
const WALL_TONES = ["#5c5c66", "#565660", "#6e4f35", "#674a32"];
const PINE_TONE = "#2e6e35";
const SPAWN_TONE = "#8a3a44"; // the pad's dark red-panel look

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
          ? SPAWN_TONE
          : FLOOR_TONES[map.floor[i]] ?? FLOOR_TONES[0];
      c.fillRect(x, y, 1, 1);
    }
  // core marker
  c.fillStyle = "#ffd37f";
  c.fillRect(BASE.x, BASE.y, BASE.size, BASE.size);
}
