import { BASE, COLS, NCELLS, ROWS } from "./constants";
import { WALL_PINE, type Prop, type Terrain } from "./terrain";
import { explain, type SaveResult } from "./types";

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
  // enemy drop zones, Mindustry-style: a spawn area is a CIRCLE, and every
  // floor tile inside it is somewhere the swarm can enter. Level scripts
  // pin wave groups to a region ({ region: 2, mace: 50 } enters only from
  // region-2 circles), and several circles may share a region id
  spawns?: SpawnCircle[];
  /**
   * LEGACY, read but never written: spawn pads painted cell by cell, NCELLS
   * of region ids. Documents saved before drop zones existed carry this,
   * and the loader fits circles over it (see fitSpawnCircles) so there is
   * exactly one spawn representation at runtime
   */
  spawn?: number[];
  pines: Prop[];
  decor: Prop[];
  // carved-valley centerline per column — generator metadata the sim's
  // seed-tower search reads; older documents fall back to a flat line
  valleyY?: number[];
  /** where this map's core sits (top-left cell). Absent = the default BASE
   * position, which is what every pre-per-core document means */
  core?: { x: number; y: number };
}

/** every playable map — add a JSON under public/maps/ and list its id here */
export const OFFICIAL_MAP_IDS: readonly string[] = [
  "grass-s",
  "dunes-long",
  "stone-canyon",
  // archived: superseded by grass-s and dunes-long, kept for reference
  "generated-24",
  "desert-3way",
];

/**
 * The loaded official map documents, in OFFICIAL_MAP_IDS order. Empty until
 * loadOfficialMaps() resolves — Game.create and the admin page both await
 * it before anything reads a map.
 */
export const OFFICIAL_MAPS: MapData[] = [];

/** fetch one official map document, bypassing the HTTP cache */
async function fetchMap(id: string): Promise<MapData> {
  const res = await fetch(`/maps/${id}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load official map "${id}" (${res.status})`);
  return (await res.json()) as MapData;
}

/** fetch (or re-fetch) every official map document into OFFICIAL_MAPS */
export async function loadOfficialMaps(): Promise<MapData[]> {
  const maps = await Promise.all(OFFICIAL_MAP_IDS.map(fetchMap));
  OFFICIAL_MAPS.length = 0;
  OFFICIAL_MAPS.push(...maps);
  return OFFICIAL_MAPS;
}

/**
 * Re-fetch a SINGLE document into OFFICIAL_MAPS, replacing the copy already
 * there. This is what starting a level needs: the editor is a client-side
 * route (router.push("/"), so module state survives the trip back), which
 * means a map edited and saved would otherwise be played from the stale
 * copy in memory. Only the map about to be played can have gone stale in a
 * way that matters, so re-reading all five — well over 400 KB, on every
 * level start — bought nothing the one document does not.
 *
 * A failed re-fetch is not fatal: an offline or 404 refresh keeps whatever
 * copy is already loaded and lets the level start on it, because a slightly
 * stale map beats no map at all.
 */
export async function refreshMap(id: string): Promise<MapData | null> {
  try {
    const doc = await fetchMap(id);
    const at = OFFICIAL_MAPS.findIndex((m) => m.id === id);
    if (at >= 0) OFFICIAL_MAPS[at] = doc;
    else OFFICIAL_MAPS.push(doc);
    return doc;
  } catch (err) {
    const have = loadMap(id);
    if (!have) throw err;
    console.warn(`could not refresh map "${id}", playing the copy already loaded`, err);
    return have;
  }
}

// ---------- palette ----------

export type PaintKind = "floor" | "wall" | "pine" | "decor" | "spawn" | "erase" | "path" | "core";

/**
 * One enemy drop zone: Mindustry marks a spawn with a tile and draws
 * state.rules.dropZoneRadius around it, and the swarm arrives inside that
 * ring. Ours is the same idea with the radius authored per circle, so a
 * mouth can be widened without repainting anything.
 */
export interface SpawnCircle {
  /** centre in cells — cell centres land on the .5, like the editor cursor */
  x: number;
  y: number;
  /** radius in cells */
  r: number;
  /** which spawn region this circle feeds, >= 1 */
  region: number;
}

/** the radius a freshly placed drop zone gets, and the range the editor offers */
export const SPAWN_RADII: readonly number[] = [4, 6, 8, 10, 14, 18];
export const SPAWN_RADIUS_DEFAULT = 8;

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
  { id: "sand", label: "Sand", kind: "floor", variants: [9, 10, 11],
    icons: [1, 2, 3].map((n) => `${ENV}/sand-floor${n}.png`) },
  { id: "darksand", label: "Darksand", kind: "floor", variants: [12, 13, 14],
    icons: [1, 2, 3].map((n) => `${ENV}/darksand${n}.png`) },
  { id: "stone-wall", label: "Stone wall", kind: "wall", variants: [0, 1],
    icons: [1, 2].map((n) => `${ENV}/stone-wall${n}.png`) },
  { id: "dirt-wall", label: "Dirt wall", kind: "wall", variants: [2, 3],
    icons: [1, 2].map((n) => `${ENV}/dirt-wall${n}.png`) },
  // the darker rock (carbon wall); variant 4 is the pine sentinel, so the
  // wall indices jump straight to 5-6
  { id: "dark-wall", label: "Dark rock", kind: "wall", variants: [5, 6],
    icons: [1, 2].map((n) => `${ENV}/carbon-wall${n}.png`) },
  // the path tool: drags carve an enemy road through rock at roughly the
  // width the generated maps use, with a little wobble on the edges, and
  // lay this floor down its middle. Variants are the road surface
  { id: "path-dirt", label: "Dirt path", kind: "path", variants: [6, 7, 8],
    icons: [1, 2, 3].map((n) => `${ENV}/dirt${n}.png`) },
  { id: "path-darksand", label: "Sand path", kind: "path", variants: [12, 13, 14],
    icons: [1, 2, 3].map((n) => `${ENV}/darksand${n}.png`) },
  { id: "pine", label: "Pine", kind: "pine", variants: [0], icons: [`${ENV}/pine.png`] },
  { id: "boulder", label: "Boulder", kind: "decor", variants: [0, 1],
    icons: [1, 2].map((n) => `${PROPS}/boulder${n}.png`) },
  { id: "shrub", label: "Shrub", kind: "decor", variants: [2], icons: [`${ENV}/shrubs1.png`] },
  // enemy spawn pads: a data layer — the pad tile shows in the editor only,
  // the game renders the floor beneath it. One variant per spawn region;
  // the variant value IS the region id written into the spawn layer
  { id: "spawn", label: "Spawn region", kind: "spawn", variants: [1, 2, 3, 4], noRandom: true,
    icons: SPAWN_REGIONS.map(() => `${ENV}/dark-panel-2.png`) },
  // the core: a map has exactly one, so placing it MOVES it. The click
  // clears the ground it lands on, since a walled core is unreachable
  { id: "core", label: "Core", kind: "core", variants: [0], noRandom: true,
    icons: ["/mindustry/sprites/blocks/storage/core-nucleus.png"] },
  { id: "erase", label: "Erase", kind: "erase", variants: [0], icons: [`${ENV}/clear-editor.png`] },
];

// ---------- terrain <-> map ----------

/**
 * Burn the drop zones into the per-cell region layer everything downstream
 * reads: the flow field's entry points, the sim's pad picker, the editor's
 * tint. A cell belongs to a circle when its CENTRE falls inside, and only
 * when it is open ground — a drop zone laid over rock simply has fewer
 * tiles in it, which is what lets a circle overhang a corridor wall without
 * spawning anything inside the mountain. Later circles win where they
 * overlap, so the last one placed is the one you see.
 */
export function rasterizeSpawns(
  circles: readonly SpawnCircle[],
  blocked: Uint8Array,
): Uint8Array {
  const spawn = new Uint8Array(NCELLS);
  for (const c of circles) {
    const r2 = c.r * c.r;
    const x0 = Math.max(0, Math.floor(c.x - c.r)), x1 = Math.min(COLS - 1, Math.ceil(c.x + c.r));
    const y0 = Math.max(0, Math.floor(c.y - c.r)), y1 = Math.min(ROWS - 1, Math.ceil(c.y + c.r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * COLS + x;
        if (blocked[i]) continue;
        const dx = x + 0.5 - c.x, dy = y + 0.5 - c.y;
        if (dx * dx + dy * dy <= r2) spawn[i] = c.region;
      }
  }
  return spawn;
}

/**
 * Fit drop zones over a legacy painted spawn layer, one circle per region:
 * centred on the region's cells and grown until it covers every last one,
 * so nothing that used to be a spawn stops being one. The circle picks up
 * some neighbouring floor the brush never painted — that is the point of
 * the shape, and the radius is editable afterwards.
 */
export function fitSpawnCircles(spawn: Uint8Array): SpawnCircle[] {
  const byRegion = new Map<number, number[]>();
  for (let i = 0; i < spawn.length; i++) {
    const r = spawn[i];
    if (!r) continue;
    const cells = byRegion.get(r);
    if (cells) cells.push(i);
    else byRegion.set(r, [i]);
  }
  const out: SpawnCircle[] = [];
  for (const [region, cells] of [...byRegion].sort((a, b) => a[0] - b[0])) {
    let sx = 0, sy = 0;
    for (const i of cells) {
      sx += (i % COLS) + 0.5;
      sy += ((i / COLS) | 0) + 0.5;
    }
    const cx = Math.round(sx / cells.length - 0.5) + 0.5;
    const cy = Math.round(sy / cells.length - 0.5) + 0.5;
    let r = 0;
    for (const i of cells)
      r = Math.max(r, Math.hypot((i % COLS) + 0.5 - cx, ((i / COLS) | 0) + 0.5 - cy));
    out.push({ x: cx, y: cy, r: Math.max(1, Math.ceil(r)), region });
  }
  return out;
}

/** a document's drop zones, whatever shape it was saved in */
export function spawnCirclesOf(m: MapData, blocked: Uint8Array): SpawnCircle[] {
  if (m.spawns) return m.spawns.map((c) => ({ ...c }));
  return fitSpawnCircles(m.spawn ? lift(m.spawn, 0) : legacySpawn(blocked));
}

/**
 * The distinct spawn regions a map feeds, ascending — what a level editor's
 * "which region does this wave enter from" picker offers. Read this rather
 * than the document's fields: it is the only thing that stays correct
 * across the painted-pads and drop-zone shapes.
 */
export function spawnRegionIds(m: MapData): number[] {
  const ids = new Set<number>();
  if (m.spawns) for (const c of m.spawns) ids.add(c.region);
  else if (m.spawn) for (const r of m.spawn) if (r > 0) ids.add(r);
  else ids.add(1); // no layer at all: the synthesized western strip
  return [...ids].sort((a, b) => a - b);
}

/**
 * Is this row nothing but the rock terrainFromMap pads a short document
 * with? Exactly the fill values lift() uses, plus no prop standing in it —
 * so dropping such a row is reversible: the next load puts it straight back.
 */
function isPadRow(t: Terrain, y: number): boolean {
  for (let x = 0; x < COLS; x++) {
    const i = y * COLS + x;
    if (t.blocked[i] !== 1 || t.floor[i] !== 3 || t.wall[i] !== 5 || t.spawn[i] !== 0) return false;
  }
  return !t.pines.some((p) => p.y === y) && !t.decor.some((p) => p.y === y);
}

/**
 * A map document is written at the map's OWN height, not the full grid.
 *
 * The editor always works on a full ROWS-high terrain, because a short
 * document is padded with rock on load. Writing that padding back out would
 * make it real: the document grows to the full grid, `rows` reads the padded
 * height, and the camera then has to fit two dozen rows of dead rock the
 * player can never reach. That is how world 1 silently became a third
 * taller than it was authored. Trailing padding is dropped instead, so a
 * save round-trips a map's height instead of ratcheting it upwards.
 *
 * Only padding is trimmed — the first row holding anything a person painted
 * stops it, so extending a map downwards in the editor still saves.
 */
export function mapFromTerrain(t: Terrain, id: string, name: string): MapData {
  let rows = ROWS;
  while (rows > 1 && isPadRow(t, rows - 1)) rows--;
  const n = rows * COLS;
  return {
    id,
    name,
    core: { x: t.core.x, y: t.core.y },
    floor: Array.from(t.floor.subarray(0, n)),
    wall: Array.from(t.wall.subarray(0, n)),
    blocked: Array.from(t.blocked.subarray(0, n)),
    // drop zones are authored, not painted: the per-cell layer is derived
    // from them on load, so writing it back out would be writing a cache
    spawns: t.spawns.map((c) => ({ ...c })),
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

/**
 * Lift one layer of a document onto the CURRENT grid. Documents are stored
 * at whatever ROWS was when they were saved, so a shorter one (the grid has
 * only ever grown) keeps its rows anchored at the top and the new ground
 * below it is filled with `pad` — rock for the blocked layer, so old maps
 * gain a rim of mountain rather than a walkable void. Same-height documents
 * pass straight through.
 */
function lift(src: readonly number[], pad: number): Uint8Array {
  const out = new Uint8Array(NCELLS);
  const rows = Math.min(ROWS, Math.floor(src.length / COLS));
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < COLS; x++) out[y * COLS + x] = src[y * COLS + x];
  for (let i = rows * COLS; i < NCELLS; i++) out[i] = pad;
  return out;
}

export function terrainFromMap(m: MapData): Terrain {
  // pad short documents with rock (blocked 1) wearing the dark carbon wall
  // sprite, over stone floor that never shows
  const blocked = lift(m.blocked, 1);
  const core = { x: m.core?.x ?? BASE.x, y: m.core?.y ?? BASE.y, size: BASE.size };
  const spawns = spawnCirclesOf(m, blocked);
  return {
    floor: lift(m.floor, 3),
    wall: lift(m.wall, 5),
    blocked,
    spawns,
    spawn: rasterizeSpawns(spawns, blocked),
    pines: m.pines.map((p) => ({ ...p })),
    decor: m.decor.map((p) => ({ ...p })),
    valleyY: m.valleyY
      ? Float32Array.from(m.valleyY)
      : new Float32Array(COLS).fill(core.y + core.size / 2),
    core,
    rows: Math.max(1, Math.min(ROWS, Math.floor(m.floor.length / COLS))),
  };
}

// ---------- storage ----------

export function loadMap(id: string): MapData | null {
  return OFFICIAL_MAPS.find((m) => m.id === id) ?? null;
}

/**
 * Persist an official map: the dev server writes the JSON document back to
 * public/maps/<id>.json. The game plays the new world on its next page
 * load (Game.create re-fetches the documents). A refusal carries the
 * route's explanation back to the editor so it can be shown, not just
 * counted as failure.
 */
export async function saveMap(map: MapData): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch("/api/maps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(map),
    });
  } catch (err) {
    // the dev server went away mid-edit — the one failure with no response
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `could not reach the dev server (${why})` };
  }
  if (!res.ok) return { ok: false, error: await explain(res) };
  // keep the in-memory documents current so admin thumbnails match
  const at = OFFICIAL_MAPS.findIndex((m) => m.id === map.id);
  if (at >= 0) OFFICIAL_MAPS[at] = map;
  return { ok: true };
}

// ---------- thumbnails ----------

/** per-cell preview colors, mirroring the atlas art's average tones */
const FLOOR_TONES = [
  "#7ab648", "#74ae45", "#6ea843", // grass
  "#8a8a93", "#84848d", "#7e7e87", // stone
  "#a5764f", "#9e7049", "#976a44", // dirt
  "#d8b290", "#dbb492", "#d9b391", // sand
  "#3f3c3c", "#413e3e", "#3f3c3c", // darksand
];
// index 4 (the pine sentinel) never reaches this table — drawThumb tests
// WALL_PINE first — but the slot keeps 5-6 (dark carbon rock) aligned
const WALL_TONES = ["#5c5c66", "#565660", "#6e4f35", "#674a32", "#000000", "#3e454a", "#3a4046"];
const PINE_TONE = "#2e6e35";

/** paint a MapData into a canvas at 1px per cell (scale it up with CSS) */
export function drawThumb(map: MapData, canvas: HTMLCanvasElement): void {
  // a document saved on a shorter grid draws at ITS height, so the card
  // preview keeps the map's real proportions instead of a padded band
  const rows = Math.max(1, Math.min(ROWS, Math.floor(map.floor.length / COLS)));
  canvas.width = COLS;
  canvas.height = rows;
  const c = canvas.getContext("2d");
  if (!c) return;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      c.fillStyle = map.blocked[i]
        ? map.wall[i] === WALL_PINE
          ? PINE_TONE
          : WALL_TONES[map.wall[i]] ?? WALL_TONES[0]
        : FLOOR_TONES[map.floor[i]] ?? FLOOR_TONES[0];
      c.fillRect(x, y, 1, 1);
    }
  // core marker
  c.fillStyle = "#ffd37f";
  c.fillRect(map.core?.x ?? BASE.x, map.core?.y ?? BASE.y, BASE.size, BASE.size);
  // Drop zones as RINGS over untouched ground, the same way the map editor
  // draws them — the floor inside a zone is ordinary floor and shouldn't be
  // recoloured. Region N keeps its palette colour whatever shape the
  // document was saved in, which is what ties a level editor's "Region 2"
  // to a place on the map.
  // The bright `css` colour at 2px, not the muted floor `tone`: a zone sits
  // at the map edge, so most of its ring falls outside the canvas and only a
  // short arc survives — a dark hairline would read as nothing at 1px/cell.
  const circles = spawnCirclesOf(map, lift(map.blocked, 1));
  c.lineWidth = 2;
  for (const z of circles) {
    c.strokeStyle = SPAWN_REGIONS[(z.region - 1) % SPAWN_REGIONS.length].css;
    c.beginPath();
    c.arc(z.x + 0.5, z.y + 0.5, z.r, 0, Math.PI * 2);
    c.stroke();
  }
}
