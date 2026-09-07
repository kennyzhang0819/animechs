import {
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
import { isWaterFloor, WALL_DEEP, WALL_PINE, type Prop, type Terrain } from "./terrain";
import {
  FLOOR_BASALT,
  FLOOR_DEEP_TAINTED_WATER,
  FLOOR_DEEP_WATER,
  FLOOR_ICE,
  FLOOR_MOSS,
  FLOOR_MUD,
  FLOOR_SALT,
  FLOOR_SHALE,
  FLOOR_SHALLOW_WATER,
  FLOOR_SNOW,
  FLOOR_SPORE_MOSS,
  FLOOR_TAINTED_WATER,
  WALL_DACITE,
  WALL_DUNE,
  WALL_ICE,
  WALL_SALT,
  WALL_SAND,
  WALL_SHALE,
  WALL_SNOW,
  WALL_SPORE,
} from "./atlas";
import { FLOOR_STYLE, propIcon, tileIcon, wallIcon, WALL_STYLE } from "./tiles";
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
  pines: Prop[];
  decor: Prop[];
  // carved-valley centerline per column — generator metadata the sim's
  // seed-tower search reads; older documents fall back to a flat line
  valleyY?: number[];
  /** where this map's base sits (top-left cell). Absent = the default BASE
   * position, which is what every pre-per-base document means */
  base?: { x: number; y: number };
  /** THE SAME FIELD UNDER ITS OLD NAME. Documents written before the base
   * stopped being called a core carry `core`, and they are on disk in
   * public/maps and in players' exported files, so the reader still takes
   * it. Nothing writes it: mapFromTerrain emits `base` only. */
  core?: { x: number; y: number };
}

/**
 * Every playable map — add a JSON under public/maps/ and list its id here.
 *
 * AN ID IS THE MAP'S OWN NAME, slugged: Confluence is "confluence", Seed 24
 * is "seed-24". They used to describe the terrain instead (grass-open,
 * tidewater), which meant the id and the name a player reads were two
 * different vocabularies and every lookup was a translation. A map that is
 * renamed is renamed in both places.
 */
export const OFFICIAL_MAP_IDS: readonly string[] = [
  // the campaign maps, in world order
  "confluence",
  "maelstrom",
  // the spore swamp — world 3
  "quagmire",
  // the second batch, worlds 4 to 9 — every one a spec over
  // scripts/maps/mindustry.mjs: the earthy one, the snowy one, the two
  // with the core in the middle of the board (Riverlands with rivers
  // running to it), and the two that are mostly water
  "greenwood",
  "tundra",
  "crater",
  "shoals",
  "riverlands",
  "estuary",
  // NOT A CAMPAIGN MAP. The last survivor of the generated set the game
  // started from, kept as the reference for what the generator produces —
  // no world names it, so it appears in the editor and nowhere else.
  "seed-24",
  // MINDUSTRY'S OWN MAPS, imported for their SHAPE (scripts/maps/import-msav.mjs):
  // the sizes, the canyons, the way a lane bends. References for authoring,
  // in the editor and nowhere else — no world plays them and no script is
  // written for them.
  "ground-zero",
  "frozen-forest",
  "cratered-battleground",
  "biomass-synthesis-facility",
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
  | "erase"
  | "path"
  | "base"
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
 * sits on rather than stand alone. Boss keeps the ladder's top-rung purple
 * (rungColor): it is not a movement layer and should not read as one.
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

export const PALETTE: readonly PaletteSet[] = [
  // the land floors are the game's own tiles (game/tiles.ts): two
  // paintings a floor in three slots, the third repeating the first
  { id: "grass", label: "Grass", kind: "floor", variants: [0, 1, 2],
    icons: [0, 1, 2].map((v) => tileIcon("grass", v)) },
  { id: "stone", label: "Stone", kind: "floor", variants: [3, 4, 5],
    icons: [0, 1, 2].map((v) => tileIcon("stone", v)) },
  { id: "dirt", label: "Dirt", kind: "floor", variants: [6, 7, 8],
    icons: [0, 1, 2].map((v) => tileIcon("dirt", v)) },
  { id: "sand", label: "Sand", kind: "floor", variants: [9, 10, 11],
    icons: [0, 1, 2].map((v) => tileIcon("sand", v)) },
  { id: "darksand", label: "Darksand", kind: "floor", variants: [12, 13, 14],
    icons: [0, 1, 2].map((v) => tileIcon("darksand", v)) },
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
  // THE SECOND ENVIRONMENT BAND (see the ENV2 note in atlas.ts). Mindustry's
  // "moss" is the purple spore growth, not a green one, so moss, spore moss,
  // mud and the two spore waters are one marsh palette; shale and basalt are
  // bare rock, and snow, ice and salt are the frozen set
  { id: "moss", label: "Moss", kind: "floor", variants: [FLOOR_MOSS, FLOOR_MOSS + 1, FLOOR_MOSS + 2],
    icons: [0, 1, 2].map((v) => tileIcon("moss", v)) },
  { id: "spore-moss", label: "Spore moss", kind: "floor",
    variants: [FLOOR_SPORE_MOSS, FLOOR_SPORE_MOSS + 1, FLOOR_SPORE_MOSS + 2],
    icons: [0, 1, 2].map((v) => tileIcon("sporeMoss", v)) },
  { id: "mud", label: "Mud", kind: "floor", variants: [FLOOR_MUD, FLOOR_MUD + 1, FLOOR_MUD + 2],
    icons: [0, 1, 2].map((v) => tileIcon("mud", v)) },
  { id: "shale", label: "Shale", kind: "floor",
    variants: [FLOOR_SHALE, FLOOR_SHALE + 1, FLOOR_SHALE + 2],
    icons: [0, 1, 2].map((v) => tileIcon("shale", v)) },
  { id: "basalt", label: "Basalt", kind: "floor",
    variants: [FLOOR_BASALT, FLOOR_BASALT + 1, FLOOR_BASALT + 2],
    icons: [0, 1, 2].map((v) => tileIcon("basalt", v)) },
  { id: "snow", label: "Snow", kind: "floor", variants: [FLOOR_SNOW, FLOOR_SNOW + 1, FLOOR_SNOW + 2],
    icons: [0, 1, 2].map((v) => tileIcon("snow", v)) },
  { id: "ice", label: "Ice", kind: "floor", variants: [FLOOR_ICE, FLOOR_ICE + 1, FLOOR_ICE + 2],
    icons: [0, 1, 2].map((v) => tileIcon("ice", v)) },
  // salt and both spore waters are ONE tile each, like the clear waters
  { id: "salt", label: "Salt", kind: "floor", variants: [FLOOR_SALT],
    icons: [tileIcon("salt", 0)] },
  { id: "spore-water", label: "Spore water", kind: "floor", variants: [FLOOR_TAINTED_WATER],
    icons: [`${ENV}/tainted-water.png`] },
  { id: "deep-spore-water", label: "Deep spore water", kind: "deep",
    variants: [FLOOR_DEEP_TAINTED_WATER], icons: [`${ENV}/deep-tainted-water.png`] },
  { id: "stone-wall", label: "Stone wall", kind: "wall", variants: [0, 1],
    icons: [0, 1].map((v) => wallIcon("stone", v)) },
  { id: "dirt-wall", label: "Dirt wall", kind: "wall", variants: [2, 3],
    icons: [0, 1].map((v) => wallIcon("dirt", v)) },
  // the darker rock (carbon wall); variant 4 is the pine sentinel, so the
  // wall indices jump straight to 5-6
  { id: "dark-wall", label: "Dark rock", kind: "wall", variants: [5, 6],
    icons: [0, 1].map((v) => wallIcon("dark", v)) },
  // the second band's rock, all of it past the two sentinels and so all of
  // it ordinary buildable wall
  { id: "spore-wall", label: "Spore wall", kind: "wall", variants: [WALL_SPORE, WALL_SPORE + 1],
    icons: [0, 1].map((v) => wallIcon("spore", v)) },
  { id: "shale-wall", label: "Shale wall", kind: "wall", variants: [WALL_SHALE, WALL_SHALE + 1],
    icons: [0, 1].map((v) => wallIcon("shale", v)) },
  { id: "dacite-wall", label: "Dacite wall", kind: "wall", variants: [WALL_DACITE, WALL_DACITE + 1],
    icons: [0, 1].map((v) => wallIcon("dacite", v)) },
  { id: "sand-wall", label: "Sand wall", kind: "wall", variants: [WALL_SAND, WALL_SAND + 1],
    icons: [0, 1].map((v) => wallIcon("sand", v)) },
  { id: "dune-wall", label: "Dune wall", kind: "wall", variants: [WALL_DUNE, WALL_DUNE + 1],
    icons: [0, 1].map((v) => wallIcon("dune", v)) },
  { id: "snow-wall", label: "Snow wall", kind: "wall", variants: [WALL_SNOW, WALL_SNOW + 1],
    icons: [0, 1].map((v) => wallIcon("snow", v)) },
  { id: "ice-wall", label: "Ice wall", kind: "wall", variants: [WALL_ICE, WALL_ICE + 1],
    icons: [0, 1].map((v) => wallIcon("ice", v)) },
  { id: "salt-wall", label: "Salt wall", kind: "wall", variants: [WALL_SALT, WALL_SALT + 1],
    icons: [0, 1].map((v) => wallIcon("salt", v)) },
  // the path tool: drags carve an enemy road through rock at roughly the
  // width the generated maps use, with a little wobble on the edges, and
  // lay this floor down its middle. Variants are the road surface
  { id: "path-dirt", label: "Dirt path", kind: "path", variants: [6, 7, 8],
    icons: [0, 1, 2].map((v) => tileIcon("dirt", v)) },
  { id: "path-darksand", label: "Sand path", kind: "path", variants: [12, 13, 14],
    icons: [0, 1, 2].map((v) => tileIcon("darksand", v)) },
  { id: "path-mud", label: "Mud path", kind: "path",
    variants: [FLOOR_MUD, FLOOR_MUD + 1, FLOOR_MUD + 2],
    icons: [0, 1, 2].map((v) => tileIcon("mud", v)) },
  // ONE PINE SET, THREE FORESTS: the variant is the tree (UV_PINES), not a
  // reshuffle of the same one, so a marsh is forested in spore pines and a
  // snowfield in snow pines without a second blocking brush
  { id: "pine", label: "Pine", kind: "pine", variants: [0, 1, 2], noRandom: true,
    icons: [propIcon("pine"), propIcon("sporePine"), propIcon("snowPine")] },
  { id: "boulder", label: "Boulder", kind: "decor", variants: [0, 1],
    icons: [propIcon("boulder0"), propIcon("boulder1")] },
  { id: "shrub", label: "Shrub", kind: "decor", variants: [2, 11],
    icons: [propIcon("shrubs"), propIcon("shrubs2")] },
  { id: "spore-cluster", label: "Spore cluster", kind: "decor", variants: [3, 4, 5],
    icons: [propIcon("sporeCluster0"), propIcon("sporeCluster1"), propIcon("sporeCluster2")] },
  { id: "pur-bush", label: "Purple bush", kind: "decor", variants: [6],
    icons: [propIcon("purBush")] },
  { id: "shale-boulder", label: "Shale boulder", kind: "decor", variants: [7, 8],
    icons: [propIcon("shaleBoulder0"), propIcon("shaleBoulder1")] },
  { id: "snow-boulder", label: "Snow boulder", kind: "decor", variants: [9, 10],
    icons: [propIcon("snowBoulder0"), propIcon("snowBoulder1")] },
  { id: "sand-boulder", label: "Sand boulder", kind: "decor", variants: [12, 13],
    icons: [propIcon("sandBoulder0"), propIcon("sandBoulder1")] },
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
  // the base: a map has exactly one, so placing it MOVES it. The click
  // clears the ground it lands on, since a walled base is unreachable
  { id: "base", label: "Base", kind: "base", variants: [0], noRandom: true,
    icons: ["/mindustry/sprites/blocks/storage/core-nucleus.png"] },
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
  { label: "Ground", ids: ["grass", "stone", "dirt", "sand", "darksand", "moss", "spore-moss",
    "mud", "shale", "basalt", "snow", "ice", "salt"] },
  { label: "Water", ids: ["water", "deep-water", "spore-water", "deep-spore-water"] },
  { label: "Walls", ids: ["stone-wall", "dirt-wall", "dark-wall", "spore-wall", "shale-wall",
    "dacite-wall", "sand-wall", "dune-wall", "snow-wall", "ice-wall", "salt-wall", "pine"] },
  { label: "Paths", ids: ["path-dirt", "path-darksand", "path-mud"] },
  { label: "Props", ids: ["boulder", "shrub", "spore-cluster", "pur-bush", "shale-boulder",
    "snow-boulder", "sand-boulder"] },
  { label: "Zones", ids: ["spawn", "base"] },
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
  return {
    id,
    name,
    // ALWAYS write the stride these arrays were flattened at. A document
    // without it is read as LEGACY_COLS, so omitting it here would corrupt
    // every map the editor touches the next time the board grows
    w: COLS,
    base: { x: t.base.x, y: t.base.y },
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
  // `core` is the field's old name — see MapData.core
  const at = m.base ?? m.core;
  const base = { x: at?.x ?? BASE.x, y: at?.y ?? BASE.y, size: BASE.size };
  const spawns = spawnCirclesOf(m, blocked);
  return {
    floor,
    wall: lift(m.wall, 5, sw),
    blocked,
    spawns,
    spawn: rasterizeSpawns(spawns, { blocked, floor }),
    pines: m.pines.map((p) => ({ ...p })),
    decor: m.decor.map((p) => ({ ...p })),
    valleyY: m.valleyY
      ? Float32Array.from(m.valleyY)
      : new Float32Array(COLS).fill(base.y + base.size / 2),
    base,
    rows: Math.max(1, Math.min(ROWS, Math.floor(m.floor.length / sw))),
    cols: Math.max(1, Math.min(COLS, sw)),
  };
}

// ---------- storage ----------

export function loadMap(id: string): MapData | null {
  return OFFICIAL_MAPS.find((m) => m.id === id) ?? null;
}

/**
 * THE MOVEMENT LAYERS A MAP OPENS A DOOR FOR — the ground, air and water
 * of its drop zones (the boss door is not a layer). This is what the
 * deploy's family roll is drawn against (rollFamilies in levels.ts): a
 * map with no water door cannot send a hull. A map that cannot be found
 * or has no zones at all opens every layer rather than none, so a broken
 * document deploys a run rather than an empty field.
 */
export function mapLayers(id: string | undefined): Set<MoveLayer> {
  const doc = id ? loadMap(id) : null;
  const out = new Set<MoveLayer>();
  if (doc)
    for (const z of zoneKindsOf(doc, Uint8Array.from(doc.blocked))) {
      const layer = zoneLayer(z);
      if (layer) out.add(layer);
    }
  return out.size > 0 ? out : new Set<MoveLayer>(["ground", "air", "water"]);
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
// the land tones are the tiles' own base colours, so a thumbnail is the
// map in miniature rather than a chart of it
const FLOOR_TONES = [
  ...(["grass", "stone", "dirt", "sand", "darksand"] as const).flatMap((k) => {
    const t = FLOOR_STYLE[k].base;
    return [t, t, t];
  }),
  "#4c6b9c", "#4c6b9c", "#4c6b9c", // shallow water
  "#2f4d7a", "#2f4d7a", "#2f4d7a", // deep water
  // the second environment band (see the ENV2 note in atlas.ts)
  ...(["moss", "sporeMoss", "mud", "shale", "snow", "salt", "ice", "basalt"] as const).flatMap(
    (k) => {
      const t = FLOOR_STYLE[k].base;
      return [t, t, t];
    },
  ),
  "#604b94", "#604b94", "#604b94", // shallow spore water
  "#44356b", "#44356b", "#44356b", // deep spore water
];
// Neither SENTINEL reaches this table: drawThumb tests both first. The
// pine slot (4) is a placeholder that keeps 5-6 (dark carbon rock)
// aligned, and so is the deep-water slot (7) — a deep cell is blocked, but
// its colour is the WATER it is, which only its floor index knows. Reading
// it from here instead is what painted a spore lake in clear-water blue.
const WALL_TONES = [
  WALL_STYLE.stone.face, WALL_STYLE.stone.face,
  WALL_STYLE.dirt.face, WALL_STYLE.dirt.face,
  "#000000", // WALL_PINE placeholder
  WALL_STYLE.dark.face, WALL_STYLE.dark.face,
  "#000000", // WALL_DEEP placeholder
  ...(["spore", "shale", "snow", "ice", "salt", "sand", "dune", "dacite"] as const).flatMap(
    (k) => [WALL_STYLE[k].face, WALL_STYLE[k].face],
  ),
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
      c.fillStyle =
        map.blocked[i] && map.wall[i] !== WALL_DEEP
          ? map.wall[i] === WALL_PINE
            ? PINE_TONE
            : WALL_TONES[map.wall[i]] ?? WALL_TONES[0]
          : FLOOR_TONES[map.floor[i]] ?? FLOOR_TONES[0];
      c.fillRect(x, y, 1, 1);
    }
  // NOTHING BUT THE GROUND. Neither the base nor the spawn zones are drawn:
  // a thumbnail is a picture of the place, and at 1px per cell a marker is a
  // coloured square sitting on the terrain that reads as an artefact rather
  // than as information. The map editor's own canvas still paints both,
  // which is where they are actually being authored
}
