import {
  ALL_MOVE_BITS,
  BASE,
  COLS,
  LAYER_BIT,
  NCELLS,
  MOVE_LAYERS,
  ROWS,
  ZONE_KINDS,
  type MoveLayer,
  type ZoneKind,
} from "./constants";

/**
 * The grid width every map was authored at before the board grew. Documents
 * saved since carry their own `w`; these do not, and this is what they mean.
 * Never change it — it is a fact about files already on disk.
 */
export const LEGACY_COLS = 128;
import { isWaterFloor, WALL_PINE, type Prop, type Terrain } from "./terrain";
import { FLOOR_DEEP_WATER, FLOOR_SHALLOW_WATER } from "./atlas";
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
  /**
   * The grid WIDTH this document's layers were saved at. The board has grown
   * since the first maps were drawn, and every layer below is a flat array
   * indexed `y * w + x` — so without this, widening COLS would reinterpret
   * every old document's rows at the wrong stride and shred it. Absent means
   * LEGACY_COLS, which is what every pre-widening document was saved at.
   *
   * Height needs no such field: it falls out of `floor.length / w`.
   */
  w?: number;
  floor: number[]; // NCELLS, UV_FLOORS index
  wall: number[]; // NCELLS, UV_WALLS index or WALL_PINE where blocked
  blocked: number[]; // NCELLS, 0/1
  /**
   * Enemy drop zones, Mindustry-style: a spawn area is a CIRCLE, and every
   * tile inside it that the zone's own layer can stand on is somewhere the
   * swarm can enter. Each circle names the LAYER it feeds (see SpawnCircle),
   * so a map may carry as many ground, air and water zones as it likes and
   * nothing in a level script has to name any of them.
   */
  spawns?: SpawnCircle[];
  /**
   * LEGACY, read but never written: spawn pads painted cell by cell, NCELLS
   * of region ids. Documents saved before drop zones existed carry this,
   * and the loader fits circles over it (see fitSpawnCircles) so there is
   * exactly one spawn representation at runtime
   */
  spawn?: number[];
  /**
   * LEGACY exits, read but never written: NCELLS of 0/1, from before exits
   * were split per movement layer. Every set cell is read as an exit for
   * ALL layers, which is what one undifferentiated goal band meant.
   */
  goal?: number[];
  /**
   * THE EXITS, NCELLS of LAYER_BIT masks — ground 1, air 2, water 4, ORed
   * where a cell serves several. This is what the editor writes now; the
   * name is new precisely so it can be told apart from the legacy `goal`
   * array, which holds 0/1 and would otherwise be indistinguishable from a
   * document whose author had painted ground exits and nothing else.
   */
  exits?: number[];
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
  "grass-open",
  // the hand-drawn Three Gates, kept as its own map so the reconstruction
  // can be compared against what it was drawn from
  "grass-open-v1",
  "tidewater",
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
 * way that matters, so re-reading all of them — well over 400 KB, on every
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

export type PaintKind =
  | "floor"
  | "wall"
  | "pine"
  | "decor"
  | "spawn"
  | "goal"
  | "erase"
  | "path"
  | "core"
  /** deep water: blocks the swarm like a wall, takes no tower like a pine
   *  — a floor index plus the WALL_DEEP sentinel (see terrain.ts) */
  | "deep";

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
  /**
   * WHAT ENTERS HERE: one movement layer, or the boss door. This replaced
   * the numeric `region`, and with it the whole business of a wave group
   * naming a number the map had to match — see MOVE_LAYERS in constants.ts.
   * A document written before the split carries `region` instead, which
   * spawnCirclesOf migrates.
   */
  zone: ZoneKind;
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

export interface ZoneStyle {
  /** multiplies the pad sprite in the editor's terrain pass */
  tint: readonly [number, number, number];
  /** the picker's swatch and every zone outline */
  css: string;
  /** the darker fill thumbnails paint with */
  tone: string;
}

/**
 * THE PAD SPRITE'S OWN COLOUR. Every tint below is `wanted / this`, which
 * is how a single grey-pink pad sprite comes out in four different colours.
 */
const PAD_RGB = [0.878, 0.459, 0.498] as const;

/**
 * ONE COLOUR PER ZONE KIND, and no generator behind it any more.
 *
 * The regions this replaced had an unbounded count, so their colours had to
 * be GENERATED — four hand-picked ones and a golden-angle hue walk for the
 * rest, which meant a map's fifth zone got whatever colour the sequence
 * happened to land on and two distant regions could still collide. There
 * are exactly four kinds now and they never grow, so all four are chosen by
 * eye and a colour means the same thing on every map ever authored: green
 * is where the walkers come in, amber is the air, blue is the water.
 *
 * Blue for water risks reading against the water floors themselves, which
 * is why it is a lighter, harder cyan-blue than any tile — a zone ring is
 * drawn as a stroke over the ground, so it only has to beat the ground it
 * sits on rather than stand alone. Boss keeps Eradication's purple: it is
 * not a movement layer and should not read as one.
 */
export const ZONE_STYLES: Readonly<Record<ZoneKind, ZoneStyle>> = {
  ground: {
    tint: [0.482 / PAD_RGB[0], 0.898 / PAD_RGB[1], 0.541 / PAD_RGB[2]],
    css: "#7BE58A",
    tone: "#407748",
  },
  air: {
    tint: [1.0 / PAD_RGB[0], 0.788 / PAD_RGB[1], 0.42 / PAD_RGB[2]],
    css: "#FFC96B",
    tone: "#856938",
  },
  water: {
    tint: [0.31 / PAD_RGB[0], 0.69 / PAD_RGB[1], 0.91 / PAD_RGB[2]],
    css: "#4FB0E8",
    tone: "#295C79",
  },
  boss: {
    tint: [0.627 / PAD_RGB[0], 0.353 / PAD_RGB[1], 0.898 / PAD_RGB[2]],
    css: "#A05AE5",
    tone: "#532F77",
  },
};

/** what a zone kind is called wherever one is shown to an author */
export const ZONE_LABELS: Readonly<Record<ZoneKind, string>> = {
  ground: "Ground",
  air: "Air",
  water: "Water",
  boss: "Boss",
};

/** the display style of a zone kind — the one place a zone's colour lives */
export const zoneStyle = (zone: ZoneKind): ZoneStyle => ZONE_STYLES[zone];

/**
 * The movement layer a zone kind feeds, for the three that are layers.
 * A boss zone has no layer of its own: the boss brings its own.
 */
export const zoneLayer = (zone: ZoneKind): MoveLayer | null =>
  zone === "boss" ? null : zone;

/**
 * The region id a pre-layer document's zone becomes a zone KIND from.
 *
 * 255 was the boss door. Every other number was an ordinary wave region,
 * and the honest reading of one is "both the walkers and the flyers came
 * in here", because that is exactly what the old code did with it — the
 * same circle was rasterized into the ground mask and the air mask. One
 * circle can only carry one kind now, so a legacy zone becomes a GROUND
 * zone and spawnCirclesOf adds an air twin beside it; nothing that used to
 * enter a map stops being able to.
 */
const LEGACY_BOSS_REGION = 255;

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
  // THE TWO WATERS, and they are different KINDS of paint, not two floors.
  //
  // Shallow water is an ordinary floor: it clears the cell like any other
  // floor brush, ground units march across it, and the flow field never
  // learns it is there. Deep water paints a BLOCKED cell wearing the
  // WALL_DEEP sentinel — the swarm routes around it and no tower can be
  // built on it, which is why it is a kind of its own rather than another
  // entry in the wall list (a wall is buildable; this is not).
  //
  // One variant each: Mindustry ships water as a single tile rather than
  // the numbered triples the land floors have (see UV_FLOORS in atlas.ts).
  { id: "water", label: "Water", kind: "floor", variants: [FLOOR_SHALLOW_WATER],
    icons: [`${ENV}/shallow-water.png`] },
  { id: "deep-water", label: "Deep water", kind: "deep", variants: [FLOOR_DEEP_WATER],
    icons: [`${ENV}/deep-water.png`] },
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
  // DROP ZONES: a data layer — no pad tile is painted anywhere; the editor
  // shows each zone as its circle overlay over the floor.
  //
  // THE VARIANT INDEXES ZONE_KINDS, so the four swatches ARE the four kinds
  // and there is no fifth. This used to be an open-ended list of region
  // numbers whose swatch count grew on demand; what a map actually needs is
  // a fixed vocabulary — walkers here, flyers there, hulls in the channel —
  // and a closed set is what lets every colour mean the same thing on
  // every map (see ZONE_STYLES).
  { id: "spawn", label: "Drop zone", kind: "spawn",
    variants: ZONE_KINDS.map((_, i) => i), noRandom: true,
    icons: ZONE_KINDS.map(() => `${ENV}/dark-panel-2.png`) },
  // the core: a map has exactly one, so placing it MOVES it. The click
  // clears the ground it lands on, since a walled core is unreachable
  { id: "core", label: "Core", kind: "core", variants: [0], noRandom: true,
    icons: ["/mindustry/sprites/blocks/storage/core-nucleus.png"] },
  // THE EXITS: where the swarm is trying to GET TO, one variant per
  // movement layer (the variant indexes MOVE_LAYERS). Like drop zones this
  // is a data layer the game never draws — the floor underneath shows
  // through and the editor marks it in the overlay.
  //
  // Painting is per layer and additive: a cell can be a ground exit and an
  // air exit at once, and the eraser takes back only the layer in hand. A
  // map with any exit at all routes to them instead of to its core, and a
  // LAYER with none falls back to the union of the rest, so painting only
  // the ground exits never strands the flyers (see Sim.exitsFor).
  { id: "goal", label: "Exit", kind: "goal",
    variants: MOVE_LAYERS.map((_, i) => i), noRandom: true,
    icons: MOVE_LAYERS.map(() => `${ENV}/dark-panel-3.png`) },
  { id: "erase", label: "Erase", kind: "erase", variants: [0], icons: [`${ENV}/clear-editor.png`] },
];


/**
 * HOW THE PALETTE IS GROUPED IN THE EDITOR, and the order the groups and
 * their entries appear in.
 *
 * The picker used to be one tall column with every set's NAME over its
 * swatches — sixteen headings down the side of the screen, which made the
 * panel a scrolling list rather than a tool tray. Grouping by what a brush
 * DOES lets the names go: a stone floor and a stone wall are unmistakable
 * as sprites once they are not sitting in the same undifferentiated stack,
 * and a section heading carries the distinction that actually matters.
 *
 * A set listed in no section would silently vanish from the editor, so
 * paletteSections() checks the two lists agree rather than trusting them.
 */
export const PALETTE_SECTIONS: readonly { label: string; ids: readonly string[] }[] = [
  { label: "Ground", ids: ["grass", "stone", "dirt", "sand", "darksand", "water", "deep-water"] },
  { label: "Walls", ids: ["stone-wall", "dirt-wall", "dark-wall", "pine"] },
  { label: "Paths", ids: ["path-dirt", "path-darksand"] },
  { label: "Props", ids: ["boulder", "shrub"] },
  { label: "Zones", ids: ["spawn", "goal", "core"] },
  { label: "Tools", ids: ["erase"] },
];

/**
 * The palette as sections of resolved sets. Throws on a set that is in
 * PALETTE but no section, or a section naming a set that does not exist —
 * both are edits that would otherwise show up as a brush quietly missing
 * from the editor.
 */
export function paletteSections(): { label: string; sets: PaletteSet[] }[] {
  const byId = new Map(PALETTE.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out = PALETTE_SECTIONS.map(({ label, ids }) => ({
    label,
    sets: ids.map((id) => {
      const set = byId.get(id);
      if (!set) throw new Error(`palette section "${label}" names unknown set "${id}"`);
      seen.add(id);
      return set;
    }),
  }));
  const orphan = PALETTE.find((s) => !seen.has(s.id));
  if (orphan) throw new Error(`palette set "${orphan.id}" is in no section — add it to PALETTE_SECTIONS`);
  return out;
}

// ---------- terrain <-> map ----------

/**
 * Burn the drop zones into the per-cell region layer everything downstream
 * reads: the flow field's entry points, the sim's pad picker, the editor's
 * tint. A cell belongs to a circle when its CENTRE falls inside, and —
 * when `blocked` is given — only when it is open ground: a drop zone laid
 * over rock simply has fewer tiles in it, which is what lets a circle
 * overhang a corridor wall without spawning a WALKER inside the mountain.
 * Later circles win where they overlap, so the last one placed is the one
 * you see.
 *
 * Pass `null` for the AIR mask: a flyer ignores terrain, so a zone painted
 * entirely over hills is a perfectly good air door — the sim rasterizes
 * both layers and flyers enter by the terrain-blind one (see
 * Flowfield.rebuildWalk).
 */
export function rasterizeSpawns(
  circles: readonly SpawnCircle[],
  terrain: { blocked: Uint8Array; floor: Uint8Array } | null,
): Uint8Array {
  const spawn = new Uint8Array(NCELLS);
  for (const c of circles) {
    const bit = LAYER_BIT[c.zone];
    const r2 = c.r * c.r;
    const x0 = Math.max(0, Math.floor(c.x - c.r)), x1 = Math.min(COLS - 1, Math.ceil(c.x + c.r));
    const y0 = Math.max(0, Math.floor(c.y - c.r)), y1 = Math.min(ROWS - 1, Math.ceil(c.y + c.r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * COLS + x;
        const dx = x + 0.5 - c.x, dy = y + 0.5 - c.y;
        if (dx * dx + dy * dy > r2) continue;
        // EACH LAYER FILTERS ITS OWN CELLS, which is what replaced the pair
        // of rasterizations this used to need (one terrain-aware for the
        // walkers, one terrain-blind for the flyers). A walker needs open
        // ground, a hull needs water, and a flyer needs nothing at all — so
        // a single circle can be a legal air door over a mountain and an
        // illegal ground door on the same tile, which is exactly right.
        // A boss zone is left unfiltered here and narrowed by the boss's
        // own layer when it spawns.
        if (terrain) {
          if (c.zone === "ground" && terrain.blocked[i]) continue;
          if (c.zone === "water" && !isWaterFloor(terrain.floor[i])) continue;
        }
        spawn[i] |= bit;
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
    const circle = { x: cx, y: cy, r: Math.max(1, Math.ceil(r)) };
    if (region === LEGACY_BOSS_REGION) out.push({ ...circle, zone: "boss" });
    else out.push({ ...circle, zone: "ground" }, { ...circle, zone: "air" });
  }
  return out;
}

/**
 * A document's drop zones, whatever shape it was saved in — and the one
 * place a pre-layer document is translated.
 *
 * A zone that already names its layer passes straight through. One carrying
 * the old numeric `region` becomes a GROUND zone plus an AIR twin at the
 * same place, because that is precisely what the old code did with it: the
 * same circle was rasterized into the ground mask and again into the
 * terrain-blind air mask. Region 255 was the boss door and becomes one.
 */
export function spawnCirclesOf(m: MapData, blocked: Uint8Array): SpawnCircle[] {
  if (m.spawns) {
    const out: SpawnCircle[] = [];
    for (const c of m.spawns) {
      const legacy = c as SpawnCircle & { region?: number };
      if (legacy.zone && ZONE_KINDS.includes(legacy.zone)) {
        out.push({ x: c.x, y: c.y, r: c.r, zone: legacy.zone });
      } else if (legacy.region === LEGACY_BOSS_REGION) {
        out.push({ x: c.x, y: c.y, r: c.r, zone: "boss" });
      } else {
        out.push({ x: c.x, y: c.y, r: c.r, zone: "ground" });
        out.push({ x: c.x, y: c.y, r: c.r, zone: "air" });
      }
    }
    return out;
  }
  return fitSpawnCircles(m.spawn ? lift(m.spawn, 0, m.w ?? LEGACY_COLS) : legacySpawn(blocked));
}

/**
 * WHICH ZONE KINDS A MAP ACTUALLY CARRIES — what the editors report, and
 * what replaced spawnRegionIds.
 *
 * The function it replaced fed a "which region does this wave enter from"
 * picker in the level editor. There is no such picker any more: a unit's
 * layer decides its door, so the only question left is whether the map has
 * a door of each kind at all, which is a warning rather than a choice.
 */
export function zoneKindsOf(m: MapData, blocked: Uint8Array): Set<ZoneKind> {
  const out = new Set<ZoneKind>();
  for (const c of spawnCirclesOf(m, blocked)) out.add(c.zone);
  return out;
}

/**
 * Is this row nothing but the rock terrainFromMap pads a short document
 * with? Exactly the fill values lift() uses, plus no prop standing in it —
 * so dropping such a row is reversible: the next load puts it straight back.
 */
function isPadRow(t: Terrain, y: number): boolean {
  for (let x = 0; x < COLS; x++) {
    const i = y * COLS + x;
    // a goal cell makes a row real however untouched it otherwise looks —
    // trimming one away would silently delete the swarm's destination
    if (t.goal[i] !== 0) return false;
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

/**
 * How many rows of this terrain are actually MAP, as opposed to the rock
 * padding terrainFromMap lifts every short document onto.
 *
 * Exactly the rule a save uses (mapFromTerrain trims trailing pad rows), so
 * what the editor draws as the map's edge is what the file will be written
 * at — the height stops being something you only discover after saving.
 * Walks up from the bottom and stops at the first row holding anything.
 */
export function contentRows(t: Terrain): number {
  let rows = ROWS;
  while (rows > 1 && isPadRow(t, rows - 1)) rows--;
  return rows;
}

export function mapFromTerrain(
  t: Terrain,
  id: string,
  name: string,
  /**
   * The height to write, in rows. The map editor passes the height it is
   * showing, so what is saved is exactly the map that was on screen.
   *
   * Omitted, it falls back to trimming trailing padding — the old rule, and
   * still the right one for a caller that has no authored height to offer.
   * That rule is a GUESS, though: it reads back a height from what the rows
   * happen to look like, which is why the editor stopped relying on it.
   */
  height?: number,
): MapData {
  const rows = height ? Math.max(1, Math.min(ROWS, Math.floor(height))) : contentRows(t);
  const n = rows * COLS;
  const exits = Array.from(t.goal.subarray(0, n));
  return {
    id,
    name,
    // ALWAYS write the stride these arrays were flattened at. A document
    // without it is read as LEGACY_COLS, so omitting it here would corrupt
    // every map the editor touches the next time the board grows
    w: COLS,
    core: { x: t.core.x, y: t.core.y },
    floor: Array.from(t.floor.subarray(0, n)),
    wall: Array.from(t.wall.subarray(0, n)),
    blocked: Array.from(t.blocked.subarray(0, n)),
    // omitted entirely on a core map, so its document stays as it was.
    // Written as `exits` rather than `goal`: the values are LAYER MASKS
    // now, and a reader has to be able to tell a 1 that means "ground
    // only" from a legacy 1 that meant "everyone"
    ...(exits.some((g) => g !== 0) ? { exits } : {}),
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
function lift(src: readonly number[], pad: number, srcW: number): Uint8Array {
  const out = new Uint8Array(NCELLS).fill(pad);
  const rows = Math.min(ROWS, Math.floor(src.length / srcW));
  const cols = Math.min(COLS, srcW);
  // row by row at the SOURCE stride, into the current one — a narrower
  // document lands in the top-left and the rest of the board stays `pad`
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) out[y * COLS + x] = src[y * srcW + x];
  return out;
}

export function terrainFromMap(m: MapData): Terrain {
  // pad short documents with rock (blocked 1) wearing the dark carbon wall
  // sprite, over stone floor that never shows
  const sw = m.w ?? LEGACY_COLS;
  const blocked = lift(m.blocked, 1, sw);
  const floor = lift(m.floor, 3, sw);
  const core = { x: m.core?.x ?? BASE.x, y: m.core?.y ?? BASE.y, size: BASE.size };
  const spawns = spawnCirclesOf(m, blocked);
  // THE EXITS, and the one place a pre-layer document is translated: a
  // legacy `goal` array holds 0/1 and meant "everything comes here", so
  // every set cell becomes an exit for all three layers. A document that
  // carries `exits` already holds the mask and is taken as written.
  const exits = m.exits
    ? lift(m.exits, 0, sw)
    : m.goal
      ? lift(m.goal, 0, sw).map((v) => (v ? ALL_MOVE_BITS : 0))
      : new Uint8Array(NCELLS);
  return {
    floor,
    wall: lift(m.wall, 5, sw),
    blocked,
    spawns,
    spawn: rasterizeSpawns(spawns, { blocked, floor }),
    goal: exits,
    pines: m.pines.map((p) => ({ ...p })),
    decor: m.decor.map((p) => ({ ...p })),
    valleyY: m.valleyY
      ? Float32Array.from(m.valleyY)
      : new Float32Array(COLS).fill(core.y + core.size / 2),
    core,
    rows: Math.max(1, Math.min(ROWS, Math.floor(m.floor.length / sw))),
    cols: Math.max(1, Math.min(COLS, sw)),
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
  "#4c6b9c", "#4c6b9c", "#4c6b9c", // shallow water
  "#2f4d7a", "#2f4d7a", "#2f4d7a", // deep water
];
// index 4 (the pine sentinel) never reaches this table — drawThumb tests
// WALL_PINE first — but the slot keeps 5-6 (dark carbon rock) aligned.
// Index 7 (WALL_DEEP) DOES reach it: a deep-water cell is blocked, so the
// thumbnail looks its tone up here rather than in FLOOR_TONES, and it has
// to come back water-coloured or every lake would draw as rock
const WALL_TONES = [
  "#5c5c66", "#565660", "#6e4f35", "#674a32", "#000000", "#3e454a", "#3a4046", "#2f4d7a",
];
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
  // core marker. Spawn zones are deliberately NOT drawn: a thumbnail is a
  // picture of the place, and at 1px per cell a zone ring is a coloured arc
  // clipped by the map edge that reads as an artefact rather than as
  // information. The map editor's own canvas still paints them, which is
  // where they are actually being authored
  c.fillStyle = "#ffd37f";
  c.fillRect(map.core?.x ?? BASE.x, map.core?.y ?? BASE.y, BASE.size, BASE.size);
}
