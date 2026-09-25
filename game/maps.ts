import { BASE, CELL, COLS, NCELLS, RANDOM_MAP_ID, ROWS } from "./constants";
export { RANDOM_MAP_ID };

/**
 * The grid width every map was authored at before the board grew. Documents
 * saved since carry their own `w`; these do not, and this is what they mean.
 * Never change it — it is a fact about files already on disk.
 */
export const LEGACY_COLS = 128;
import { MARK_KINDS, markOpts, markSize, type MapMark } from "./missionMarks";
import { railsFor } from "./missions";
import {
  canHoldSpawn,
  forestOf,
  isBuildableWall,
  spawnClearOfCore,
  LEGACY_PINE_TONES,
  propMask,
  rebuildReserved,
  WALL_DEEP,
  WALL_PROP,
  type Prop,
  type Terrain,
} from "./terrain";
import {
  FLOOR_BASALT,
  FLOOR_DEEP_TAINTED_WATER,
  FLOOR_DEEP_WATER,
  FLOOR_GROUPS,
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
  WALL_GROUP,
  WALL_GROUP_KINDS,
  WALL_ICE,
  WALL_SALT,
  WALL_SAND,
  WALL_SHALE,
  WALL_SNOW,
  WALL_SPORE,
} from "./atlas";
import { FLOOR_STYLE, tileIcon, wallIcon, WALL_STYLE, waterTone } from "./tiles";
import { PROP_KINDS, PROP_TONES, propIcon, propMini } from "./propArt";
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
  wall: number[]; // NCELLS, UV_WALLS index or a sentinel where blocked
  blocked: number[]; // NCELLS, 0/1
  /**
   * WHERE THE SWARM COMES IN: spawn tiles, painted cell by cell, as a
   * sorted list of cell indices at this document's own stride (`w`).
   *
   * ONE LAYER, NO KINDS. A spawn tile is a spawn tile — the unit picks its
   * own out of them (see Sim.padMaskFor): a hull prefers the wet ones, a
   * walker and a flyer take the dry ones. That is what replaced the four
   * kinds of drop zone circle, which made an author say three times, in
   * three colours, what the units already know about themselves.
   *
   * A LIST RATHER THAN A CELL-PER-ENTRY LAYER because it is sparse: a
   * well-painted map is a few thousand tiles out of 262,144, and the other
   * layers are dense enough to be worth their full length. It is also why
   * the ONLY invariant is kept here rather than trusted: a spawn tile is
   * open ground (see spawnTilesOf) — nothing enters on a hill.
   */
  spawnTiles?: number[];
  /**
   * LEGACY, read but never written: drop zone CIRCLES, each naming the
   * layer it fed. Every document the map generator writes still carries
   * these (scripts/maps), and spawnTilesOf burns them down to tiles on
   * load — the union of all of them, clipped to open ground.
   */
  spawns?: SpawnCircle[];
  /**
   * LEGACY, read but never written: spawn pads as NCELLS of region ids,
   * from before drop zones existed. Any non-zero cell is a spawn tile.
   */
  spawn?: number[];
  /** the props standing on this map (docs/props.md); every cell under one
   *  is blocked and wears WALL_PROP */
  props?: Prop[];
  /**
   * LEGACY, read but never written: the pines of a document from before
   * the props — one 48px tree a cell, at its centre in world px. Their
   * cells already wear the sentinel; the loader grows them into trees
   * (terrainFromMap).
   */
  pines?: LegacyProp[];
  /** LEGACY, ignored: the old non-blocking clutter — boulders and shrubs
   *  the swarm walked through. Nothing reads it; the scripts still write it */
  decor?: unknown[];
  // carved-valley centerline per column — generator metadata the sim's
  // seed-tower search reads; older documents fall back to a flat line
  valleyY?: number[];
  /**
   * THE MISSION FURNITURE placed on this map (missionMarks.ts MapMark):
   * the buff towers an intercept plants, and whatever a later mission
   * asks an author to put down.
   *
   * A LIST rather than a layer — there are a handful, each covers a
   * footprint several cells across, and a
   * cell-per-entry grid cannot say which cells are one mark.
   *
   * IT CARRIES A SCHEDULE NUMBER and that is the one place this document
   * goes past pure terrain. The wave a tower rises on is an attribute of
   * THAT TOWER, and the map document is the only thing the editor can
   * write (app/api/levels refuses everything but the campaign's script),
   * so an author who can place one can set it. What a wave IS stays the
   * mission's (levels.ts InterceptMission).
   */
  marks?: MapMark[];
  /** where this map's base sits (top-left cell). Absent = the default BASE
   * position, which is what every pre-per-base document means */
  base?: { x: number; y: number };
  /** THE SAME FIELD UNDER ITS OLD NAME. Documents written before the base
   * stopped being called a core carry `core`, and they are on disk in
   * public/maps and in players' exported files, so the reader still takes
   * it. Nothing writes it: mapFromTerrain emits `base` only. */
  core?: { x: number; y: number };
}

/** the shape a legacy pine was saved in (MapData.pines) */
export interface LegacyProp {
  x: number;
  y: number;
  size: number;
  rot: number;
  kind: number;
}

/**
 * Every playable map — add a JSON under public/maps/ and list its id here.
 *
 * AN ID IS THE MAP'S OWN NAME, slugged: Confluence is "confluence",
 * Riverlands is "riverlands". They used to describe the terrain instead
 * (grass-open, tidewater), which meant the id and the name a player reads
 * were two different vocabularies and every lookup was a translation. A map
 * that is renamed is renamed in both places. Nothing answers for the old
 * spelling: readMapPick (progress.ts) keeps only an id WORLDS still lists,
 * so a save naming a renamed map reads as absent, which is Random.
 */
export const OFFICIAL_MAP_IDS: readonly string[] = [
  // the campaign maps, in world order
  "confluence",
  "maelstrom",
  // the spore archipelago — world 3, the front with no air line over it
  "quagmire",
  // the archipelago — two thirds of it sea, every road between the sand
  // islands a bar of shallow the swarm wades
  "shoals",
  // THE MISSION SKETCHES — one map per archetype in docs/mission-design.md,
  // drawn in the graph editor (/admin/mapgraph) rather than hand-typed.
  // They paint NO spawn tiles of their own: a graph says where the ground
  // is and nothing about where the swarm enters it, so these come in on
  // the western strip (spawnTilesOf's fallback) until someone paints them
  "sear",
  "coldline",
  "thornway",
  "sporering",
  "twinshale",
  "whitepeak",
  "emberdeep",
  "saltmouth",
];

/**
 * The loaded official map documents, in OFFICIAL_MAP_IDS order. Empty until
 * loadOfficialMaps() resolves — Game.create and the admin page both await
 * it before anything reads a map.
 */
export const OFFICIAL_MAPS: MapData[] = [];

// one at a time, set by the run that generated it — on both threads, since
// the worker gets the document in its init message rather than fetching it
let generated: MapData | null = null;
export function setGeneratedMap(doc: MapData | null): void {
  generated = doc;
}

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
  if (id === RANDOM_MAP_ID) return generated;
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
  /**
   * THE ONE TOOL THAT PAINTS NOTHING. It selects what is already on the
   * map — a mark to edit its fields, a road corner to drag, a mark to
   * drag whole — and a click on bare ground clears the selection.
   *
   * IT IS THE DEFAULT, and it is the default because the editor had no
   * way to look at a thing without also doing something to it: a brush
   * was always in hand, so every click painted, and the only way to reach
   * a mark's fields was to hold the brush that places that kind of mark
   * and click the one already there. Moving a road corner was worse — it
   * needed the Road brush in hand, and a miss started a new road.
   */
  | "select"
  | "floor"
  | "wall"
  /** a prop (propArt.ts PROP_KINDS): a click stamps one, footprint and
   *  all, on open ground; the variants are the tones it may wear */
  | "prop"
  | "spawn"
  | "erase"
  | "path"
  | "base"
  /** a mission's own furniture (missionMarks.ts MapMark): a click stamps
   *  one and a click on one takes it off, and which KIND of mark is the
   *  palette set's id — one swatch per entry in MARK_KINDS */
  | "mark"
  /** deep water: blocks the swarm like a wall, takes no tower like a pine
   *  — a floor index plus the WALL_DEEP sentinel (see terrain.ts) */
  | "deep"
  | "erase";

/**
 * LEGACY, read and never written: one drop zone circle, as every document
 * the map generator writes still carries them (scripts/maps/*.mjs).
 *
 * `zone` was WHAT ENTERS HERE — one movement layer, or the boss door — and
 * nothing reads it any more: spawnTilesOf takes the union of every circle
 * on the map and clips it to open ground, so a map authored in circles
 * plays as the same tiles a hand-painted one would have. Older documents
 * carry a numeric `region` in its place, which is read the same way.
 */
export interface SpawnCircle {
  /** centre in cells — cell centres land on the .5, like the editor cursor */
  x: number;
  y: number;
  /** radius in cells */
  r: number;
  zone?: string;
  region?: number;
}

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
  /** for kind "mark": which mark kind this swatch places (missionMarks.ts
   *  MarkKind.id), and the missions that understand it — the editor hides
   *  a swatch no world on this map could use */
  mark?: string;
  /** for kind "prop": the kind it stamps (an index into PROP_KINDS) */
  prop?: number;
  /** for kind "mark": the body or turret each variant's swatch WEARS, so
   *  a kind with a choice on it is four pictures in the tray rather than
   *  one picture and a dropdown (see the note by the mark swatches) */
  markFaces?: string[];
  /** ...and what each variant is called, where the variants are choices
   *  rather than interchangeable art */
  variantLabels?: string[];
}

/**
 * THE SPAWN LAYER'S COLOUR — one of them, because there is one layer.
 *
 * Four kinds of drop zone needed four colours and a paragraph explaining
 * which meant what; a spawn tile means "the swarm comes in here" and
 * nothing else, so it gets the one colour that says so. A hot red-orange:
 * it has to read over grass, over sand and over water without being
 * mistaken for any of them, and it is the swarm's own colour everywhere
 * else in the game.
 *
 * `tint` is `wanted / PAD_RGB` — every quad drawn through the atlas
 * multiplies its sprite (the fragment stage is `texel * tint`), so a tint
 * over 1 is how a DARK sprite is brought up to a colour rather than merely
 * shaded towards it. PAD_RGB is the pad tile's MEAN colour, sampled off
 * the sprite: a near-neutral grey at a third brightness, which is why the
 * red channel has to be nearly tripled. (It used to be the sprite's
 * brightest PIXEL, which is a pink highlight covering a few texels — tint
 * it that way and the pad comes out the colour of the rock it is on.)
 */
const PAD_RGB = [0.335, 0.317, 0.355] as const;
const SPAWN_RGB = [0.902, 0.325, 0.259] as const;
export const SPAWN_STYLE = {
  /** multiplies the pad sprite in the terrain pass */
  tint: [
    SPAWN_RGB[0] / PAD_RGB[0],
    SPAWN_RGB[1] / PAD_RGB[1],
    SPAWN_RGB[2] / PAD_RGB[2],
  ] as readonly [number, number, number],
  /** how far the pad lets the floor beneath it show through */
  alpha: 0.82,
  /** the picker's swatch, and the overlay the route view draws */
  css: "#E65342",
} as const;

const ENV = "/stock/sprites/blocks/environment";

/** the Select swatch's arrow — written here so the tool needs no file */
const CURSOR_ICON =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<path d="M7 3 L7 25 L13 19 L17 28 L21 26 L17 18 L25 18 Z" ' +
      'fill="#e6e6ee" stroke="#14141c" stroke-width="2" stroke-linejoin="round"/></svg>',
  );

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
  // THE PROPS, one set a kind (propArt.ts PROP_KINDS): the variants are
  // the tones a kind may wear, so a boulder is painted in the rock it lies
  // against and a tree in its biome's leaf, and never at random
  ...PROP_KINDS.map((k, i) => ({
    id: `prop-${k.id}`,
    label: k.label,
    kind: "prop" as const,
    variants: [...k.tones],
    icons: k.tones.map((t) => propIcon(i, t)),
    noRandom: true,
    prop: i,
    variantLabels: k.tones.map((t) => PROP_TONES[t].label),
  })),
  // SPAWN TILES: ONE brush, painted like a floor — the brush size and the
  // round/square shape are the ordinary ones, so a mouth is a stroke and a
  // shoreline of doors is a drag along it.
  //
  // It used to be four swatches (walkers here, flyers there, hulls in the
  // channel) placing circles, which asked an author to sort the swarm by
  // layer on the map when a unit already knows its own layer. One swatch:
  // the tiles say where the swarm may come in, the units say which of them
  // they can use (Sim.padMaskFor).
  { id: "spawn", label: "Spawn tiles", kind: "spawn", variants: [0], noRandom: true,
    icons: [`${ENV}/dark-panel-2.png`] },
  // the base: a map has exactly one, so placing it MOVES it. The click
  // clears the ground it lands on, since a walled base is unreachable
  { id: "base", label: "Base", kind: "base", variants: [0], noRandom: true,
    icons: ["/stock/sprites/blocks/storage/core-nucleus.png"] },
  // the swarm's buildings — the player's roster, on the swarm's side —
  // one swatch a kind: a click stamps one on open ground and the eraser
  // takes it back off (MapData.enemies)
  // THE MISSION MARKS, one swatch a kind, built from the registry rather
  // than typed out (missionMarks.ts MARK_KINDS): adding a mission's
  // furniture is an entry there and no edit here
  // ONE SWATCH A CHOICE where a kind offers one. A mark whose body or
  // turret is a field (missionMarks.ts BUFF_TOWER) used to
  // be a single swatch you stamped and then went to the panel to set,
  // which is a decision made twice and made blind — the tray is exactly
  // where a picture can make it once. A kind with no choice is one swatch
  // as before.
  ...MARK_KINDS.map((k) => {
    const faceField = k.towerField ?? k.unitField;
    const f = faceField ? k.fields.find((x) => x.key === faceField) : null;
    const choices = f?.kind === "choice" ? f.choices : null;
    return {
      id: `mark-${k.id}`,
      label: k.label,
      kind: "mark" as const,
      variants: (choices ?? [null]).map((_, i) => i),
      noRandom: true,
      icons: (choices ?? [null]).map(() => "/stock/sprites/blocks/power/power-node-large.png"),
      mark: k.id,
      markFaces: choices ? choices.map((c) => c.value) : [k.tower ?? k.unit],
      variantLabels: choices ? choices.map((c) => c.label) : undefined,
    };
  }),
  { id: "erase", label: "Erase", kind: "erase", variants: [0], icons: [`${ENV}/clear-editor.png`] },
  // THE SELECT TOOL'S OWN PICTURE, inline rather than a file: it is editor
  // chrome and not board art, and every other swatch in the tray points at
  // something the game draws
  { id: "select", label: "Select", kind: "select", variants: [0], noRandom: true, icons: [CURSOR_ICON] },
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
    "dacite-wall", "sand-wall", "dune-wall", "snow-wall", "ice-wall", "salt-wall"] },
  { label: "Paths", ids: ["path-dirt", "path-darksand", "path-mud"] },
  { label: "Props", ids: PROP_KINDS.map((k) => `prop-${k.id}`) },
  // the veins are their own group rather than a stray swatch among the
  // floors: ore is not a floor tile at all but a layer over one (T.ore),
  // and it is the only brush that decides what a run EARNS
  { label: "Zones", ids: ["spawn", "base"] },
  // ...and the mission's own, which is the group that grows as the mission
  // list does (missionMarks.ts)
  { label: "Mission", ids: MARK_KINDS.map((k) => `mark-${k.id}`) },
  { label: "Tools", ids: ["select", "erase"] },
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
  // ...and the library's own swatches, appended to the Formations section
  // rather than declared in PALETTE: they come and go with the documents
  return out;
}

// ---------- terrain <-> map ----------

/**
 * THE SPAWN LAYER A DOCUMENT MEANS, as one cell-per-byte mask: 1 where the
 * swarm may come in, 0 everywhere else. The one place a map's spawn layer
 * is read, whatever shape it was saved in.
 *
 * A painted document (`spawnTiles`) is the plain case. A document from the
 * generator carries CIRCLES instead (`spawns`), and they are burned down
 * here: the union of every one of them, of whatever kind, because the four
 * kinds of circle were never anything a unit needed told — a hull picks
 * the wet tiles out of the layer on its own (Sim.padMaskFor). The oldest
 * documents carry a per-cell region layer, and any non-zero cell in it is
 * a spawn tile.
 *
 * NOTHING ENTERS ON A HILL. Every path is clipped by clampSpawn, here,
 * once — that is the invariant the whole system rests on (the flyers'
 * doors used to be terrain-blind, which is what let a zone painted over a
 * massif drop flyers inside the rock), and clipping it at the read means a
 * hand-edited document cannot get around it either.
 */
export function spawnTilesOf(m: MapData, blocked: Uint8Array, wall: Uint8Array, base: { x: number; y: number; size: number }): Uint8Array {
  const spawn = new Uint8Array(NCELLS);
  const w = m.w ?? LEGACY_COLS;
  if (m.spawnTiles) {
    for (const src of m.spawnTiles) {
      const x = src % w, y = (src / w) | 0;
      if (x >= COLS || y >= ROWS) continue;
      spawn[y * COLS + x] = 1;
    }
  } else if (m.spawns) {
    for (const c of m.spawns) paintCircle(spawn, c);
  } else if (m.spawn) {
    const lifted = lift(m.spawn, 0, w);
    for (let i = 0; i < NCELLS; i++) if (lifted[i]) spawn[i] = 1;
  } else {
    // pre-spawn-layer maps came in on the open cells of the western strip
    for (let y = 1; y < ROWS - 1; y++)
      for (let x = 0; x < 6; x++) spawn[y * COLS + x] = 1;
  }
  clampSpawn(spawn, blocked, wall, base);
  return spawn;
}

/** one legacy circle's cells: a cell is in when its CENTRE is */
function paintCircle(spawn: Uint8Array, c: SpawnCircle): void {
  const r2 = c.r * c.r;
  const x0 = Math.max(0, Math.floor(c.x - c.r)), x1 = Math.min(COLS - 1, Math.ceil(c.x + c.r));
  const y0 = Math.max(0, Math.floor(c.y - c.r)), y1 = Math.min(ROWS - 1, Math.ceil(c.y + c.r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - c.x, dy = y + 0.5 - c.y;
      if (dx * dx + dy * dy <= r2) spawn[y * COLS + x] = 1;
    }
}

/**
 * THE INVARIANT: a spawn tile stands where something can stand — open
 * ground or deep water (terrain.ts canHoldSpawn) — and never within
 * SPAWN_CORE_CLEAR cells of the core. Rock, props and the core's ground
 * take their tiles back, in place.
 *
 * Run wherever either layer moves — the loader, and every editor stroke
 * that raises rock (MapEditor.paintCell). A pad under a hill is not a door
 * the swarm cannot use, it is a door that would drop a body INSIDE the
 * hill, since nothing about a flyer stops it standing there.
 */
export function clampSpawn(spawn: Uint8Array, blocked: Uint8Array, wall: Uint8Array, base: { x: number; y: number; size: number }): void {
  for (let i = 0; i < spawn.length; i++)
    if (spawn[i] && (!canHoldSpawn(blocked[i], wall[i]) || !spawnClearOfCore(i % COLS, (i / COLS) | 0, base))) spawn[i] = 0;
}

/**
 * The spawn layer as a document writes it: the indices of its set cells,
 * ascending, clipped to the rows actually being saved.
 *
 * Sparse on purpose — see MapData.spawnTiles. Ascending because a diff of
 * two saves of the same map should read as the cells that changed rather
 * than as a reshuffle.
 */
export function spawnTileList(spawn: Uint8Array, cells: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < cells; i++) if (spawn[i]) out.push(i);
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
  return !t.props.some((p) => p.y <= y && y < p.y + (PROP_KINDS[p.kind]?.tiles ?? 1));
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
    // the painted spawn layer, as the cells that are set (spawnTileList).
    // A map saved from the editor stops carrying the generator's circles:
    // the tiles ARE the layer now, and a document holding both would have
    // two answers to one question (spawnTilesOf reads the tiles first)
    spawnTiles: spawnTileList(t.spawn, n),
    props: t.props.map((p) => ({ ...p })),
    // ...through each kind's own reader, so a field half-typed in the
    // editor ("2-") is cleaned on the way out rather than written to the
    // repo file and quietly read as a default next load
    marks: t.marks.flatMap((r) => {
      const k = MARK_KINDS.find((mk) => mk.id === r.kind);
      if (!k) return [];
      const pts = k.geom === "path" ? { pts: (r.pts ?? []).map((p) => [p[0], p[1]] as [number, number]) } : {};
      return [{ x: r.x, y: r.y, ...pts, kind: r.kind, opts: markOpts(k, r.opts) }];
    }),
    valleyY: Array.from(t.valleyY).map((v) => Math.round(v * 100) / 100),
  };
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

/**
 * The marks a document carries, cleaned: an unknown kind is dropped, a
 * position is clamped onto the board, and every field is read through its
 * own kind (missionMarks.ts markOpts). A hand-edited document cannot put
 * a half-built mark on a map.
 */
function marksOf(raw: readonly MapMark[] | undefined): MapMark[] {
  const out: MapMark[] = [];
  for (const m of raw ?? []) {
    const kind = MARK_KINDS.find((k) => k.id === m?.kind);
    if (!kind) continue;
    if (kind.geom === "path") {
      // A ROAD'S CORNERS ARE NOT CLAMPED TO THE BOARD. Both ends of one
      // run off the rim on purpose (missions.ts), so only the absurd is
      // refused; a path with fewer than two corners is not a line
      const pts = (m.pts ?? [])
        .map((p) => [Math.round(Number(p?.[0])), Math.round(Number(p?.[1]))] as [number, number])
        .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])
          && Math.abs(p[0]) < 4 * COLS && Math.abs(p[1]) < 4 * ROWS);
      if (pts.length < 2) continue;
      out.push({ kind: kind.id, x: pts[0][0], y: pts[0][1], pts, opts: markOpts(kind, m.opts) });
      continue;
    }
    const x = Math.round(Number(m.x)), y = Math.round(Number(m.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const mark: MapMark = { kind: kind.id, x, y, opts: markOpts(kind, m.opts) };
    const sz = markSize(mark);
    mark.x = Math.max(0, Math.min(COLS - sz, x));
    mark.y = Math.max(0, Math.min(ROWS - sz, y));
    out.push(mark);
  }
  return out;
}

/**
 * THE PROPS A DOCUMENT MEANS. A listed prop stands only where every cell
 * of its footprint wears the sentinel — a hand-edited entry over open
 * ground would be a picture the swarm walks through, so it is dropped.
 * Every sentinel cell no listed prop covers is then grown over
 * (terrain.ts forestOf): a legacy pine in the tree its forest kind meant,
 * a stray cell in a shrub, so nothing on the board blocks the swarm
 * invisibly. Deterministic, so both threads read one list.
 */
function propsOf(m: MapData, blocked: Uint8Array, wall: Uint8Array): Prop[] {
  const out: Prop[] = [];
  for (const p of m.props ?? []) {
    const def = PROP_KINDS[p?.kind];
    if (!def || !Number.isInteger(p.x) || !Number.isInteger(p.y)) continue;
    let ok = p.x >= 0 && p.y >= 0 && p.x + def.tiles <= COLS && p.y + def.tiles <= ROWS;
    for (let y = p.y; ok && y < p.y + def.tiles; y++)
      for (let x = p.x; x < p.x + def.tiles; x++)
        // a prop stands on its own cell (WALL_PROP) or on a hill's rock
        if (!blocked[y * COLS + x] || !(wall[y * COLS + x] === WALL_PROP || isBuildableWall(wall[y * COLS + x]))) { ok = false; break; }
    if (!ok) continue;
    const tone = PROP_TONES[p.tone] ? p.tone : def.tones[0];
    out.push({ x: p.x, y: p.y, kind: p.kind, tone, rot: ((p.rot | 0) % 4 + 4) % 4 });
  }
  const covered = propMask(out);
  const bare = new Uint8Array(NCELLS);
  let any = false;
  for (let i = 0; i < NCELLS; i++)
    if (blocked[i] && wall[i] === WALL_PROP && !covered[i]) { bare[i] = 1; any = true; }
  if (!any) return out;
  // the legacy pines' tones, by cell: which forest each was
  const sw = m.w ?? LEGACY_COLS;
  const pineTone = new Uint8Array(NCELLS).fill(255);
  for (const p of m.pines ?? []) {
    const x = Math.floor(p.x / CELL), y = Math.floor(p.y / CELL);
    if (x >= 0 && y >= 0 && x < Math.min(COLS, sw) && y < ROWS) pineTone[y * COLS + x] = LEGACY_PINE_TONES[p.kind] ?? LEGACY_PINE_TONES[0];
  }
  let seed = 0x9e37;
  for (let i = 0; i < m.id.length; i++) seed = (Math.imul(seed, 31) + m.id.charCodeAt(i)) | 0;
  const grown = forestOf(bare, (i) => (pineTone[i] === 255 ? LEGACY_PINE_TONES[0] : pineTone[i]), seed);
  // a grown tree takes the tone of most of its cells' pines: one look-up at
  // its corner is close enough for a forest one kind deep
  return out.concat(grown);
}

export function terrainFromMap(m: MapData): Terrain {
  // pad short documents with rock (blocked 1) wearing the dark carbon wall
  // sprite, over stone floor that never shows
  const sw = m.w ?? LEGACY_COLS;
  const blocked = lift(m.blocked, 1, sw);
  const floor = lift(m.floor, 3, sw);
  const wall = lift(m.wall, 5, sw);
  // `core` is the field's old name — see MapData.core
  const at = m.base ?? m.core;
  const base = { x: at?.x ?? BASE.x, y: at?.y ?? BASE.y, size: BASE.size };
  const t: Terrain = {
    floor,
    wall,
    blocked,
    spawn: spawnTilesOf(m, blocked, wall, base),
    props: propsOf(m, blocked, wall),
    valleyY: m.valleyY
      ? Float32Array.from(m.valleyY)
      : new Float32Array(COLS).fill(base.y + base.size / 2),
    // THE MARKS, read the same way and cleaned against their own kinds
    // (missionMarks.ts markOpts): a mark naming a kind this build does
    // not have is DROPPED rather than half-read, and a field it is
    // missing takes that field's default. Done here, where the document
    // is read, so both threads see the same list
    marks: marksOf(m.marks),
    // filled from those marks a few lines below (rebuildReserved): the mask
    // is derived and never read off the document
    reserved: new Uint8Array(NCELLS),
    // THE RAILS, by the document's own id — so the bed on the ground and
    // the line the mission's bodies walk are the same line, read out of
    // the same table (missions.ts ROAD_SPECS). A map that carries no road
    // gets an empty list and draws nothing
    rails: railsFor(m.id),
    base,
    rows: Math.max(1, Math.min(ROWS, Math.floor(m.floor.length / sw))),
    cols: Math.max(1, Math.min(COLS, sw)),
  };
  rebuildReserved(t);
  return t;
}

// ---------- storage ----------

export function loadMap(id: string): MapData | null {
  if (id === RANDOM_MAP_ID) return generated;
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

/**
 * THE CORNER MAP'S COLOURS, one a floor index and one a wall index, read
 * off the same tables the atlas paints from (FLOOR_GROUPS, WALL_GROUP) so a
 * family added or repainted there shows here without a second edit. A
 * land floor is its tile's base; a water is the tone its painted tile is
 * (tiles.ts waterTone); a rock is its family's face. The two sentinel
 * slots in the wall table are placeholders: drawThumb tests both first.
 */
const FLOOR_TONES: readonly string[] = FLOOR_GROUPS.flatMap((g) => {
  const t = "water" in g ? waterTone(g.water) : FLOOR_STYLE[g.kind].base;
  return [t, t, t];
});
const WALL_TONES: readonly string[] = WALL_GROUP.map((g) => (g < 0 ? "#000000" : WALL_STYLE[WALL_GROUP_KINDS[g]].face));
/** how far a prop's cell is pulled toward black when its prop is not
 *  known (a legacy document's card): dark enough to read as "not ground" */
const BARE_PROP_SHADE = 0.55;

/**
 * The thumbnail's painter, over any set of cell layers on the COLS-wide
 * grid — a map document's, or the live terrain's (the minimap draws the
 * ground it sits on with this, then the field over it).
 * Writes `rows` rows at 1px per cell into a canvas resized to fit.
 *
 * `hillShade` multiplies the ROCK tones and nothing else. A wall's face is
 * painted a shade LIGHTER than the floor of its own family — stone rock is
 * #84848f over stone ground's #7c7c84, and snow rock and snow ground are
 * within three points of each other — which is right on the board, where a
 * hill has an outline, a shadow and a dark interior to say what it is, and
 * useless in a corner map where it has none of those and a hill reads as
 * slightly paler dirt. Shading the rock is what puts the relief back: pass
 * a factor below 1 and every rock family darkens by the same proportion,
 * so the map keeps its own palette and only its height is restated. The
 * default is 1, which is the true tone — a map card is a picture of the
 * place, and that is what it should keep showing.
 *
 * Props are not shaded like hills: a prop is not one (it is blocked, but
 * nothing flies around it — see airWalkMask). Its cells wear the prop's
 * own colour (propArt.ts propMini) when the list is to hand, and the floor
 * pulled toward black when it is not; deep water is drawn as the water it
 * is.
 */
/** how dark a hill's edge cell is on the corner map, as a factor on its tone */
const HILL_EDGE_SHADE = 0.4;

export function paintThumb(
  cells: { floor: ArrayLike<number>; blocked: ArrayLike<number>; wall: ArrayLike<number>; props?: readonly Prop[] },
  rows: number,
  canvas: HTMLCanvasElement,
  hillShade = 1,
  edge = 1,
): void {
  canvas.width = COLS;
  canvas.height = rows;
  const c = canvas.getContext("2d");
  if (!c) return;
  const img = c.createImageData(COLS, rows);
  const d = img.data;
  const rgb = (css: string): [number, number, number] => [
    parseInt(css.slice(1, 3), 16),
    parseInt(css.slice(3, 5), 16),
    parseInt(css.slice(5, 7), 16),
  ];
  const floorRgb = FLOOR_TONES.map(rgb);
  const shade = (c: [number, number, number]): [number, number, number] =>
    hillShade === 1 ? c : [(c[0] * hillShade) | 0, (c[1] * hillShade) | 0, (c[2] * hillShade) | 0];
  const wallRgb = WALL_TONES.map((t) => shade(rgb(t)));
  const bare = (col: [number, number, number]): [number, number, number] =>
    [(col[0] * BARE_PROP_SHADE) | 0, (col[1] * BARE_PROP_SHADE) | 0, (col[2] * BARE_PROP_SHADE) | 0];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const floorCol = floorRgb[cells.floor[i]] ?? floorRgb[0];
      const col =
        cells.blocked[i] && cells.wall[i] !== WALL_DEEP
          ? cells.wall[i] === WALL_PROP
            ? bare(floorCol)
            : wallRgb[cells.wall[i]] ?? wallRgb[0]
          : floorCol;
      const o = i * 4;
      d[o] = col[0];
      d[o + 1] = col[1];
      d[o + 2] = col[2];
      d[o + 3] = 255;
    }
  for (const p of cells.props ?? []) {
    const t = PROP_KINDS[p.kind]?.tiles ?? 1;
    const col = rgb(propMini(p.kind, p.tone));
    for (let y = p.y; y < p.y + t; y++)
      for (let x = p.x; x < p.x + t; x++) {
        if (x < 0 || y < 0 || x >= COLS || y >= rows) continue;
        const o = (y * COLS + x) * 4;
        d[o] = col[0];
        d[o + 1] = col[1];
        d[o + 2] = col[2];
      }
  }
  // a hill's outer `edge` cells go dark, so a range reads as a shape
  // whatever tone its rock is drawn in; a picture shrunk below a pixel a
  // cell wants the band as wide as the shrink or it drops out
  const depth = new Uint8Array(COLS * rows);
  for (let i = 0; i < depth.length; i++)
    if (cells.blocked[i] !== 0 && cells.wall[i] !== WALL_DEEP && cells.wall[i] !== WALL_PROP) depth[i] = 255;
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= COLS || y >= rows ? 0 : depth[y * COLS + x]);
  for (let k = 1; k <= edge; k++)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (depth[i] === 255 && Math.min(at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)) < k) depth[i] = k;
      }
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] === 0 || depth[i] === 255) continue;
    const o = i * 4;
    d[o] = (d[o] * HILL_EDGE_SHADE) | 0;
    d[o + 1] = (d[o + 1] * HILL_EDGE_SHADE) | 0;
    d[o + 2] = (d[o + 2] * HILL_EDGE_SHADE) | 0;
  }
  c.putImageData(img, 0, 0);
}

/**
 * ONE PROP'S CELLS OF THE CORNER MAP, REPAINTED after it came down: the
 * floor or rock under them by paintThumb's rule, and the hill edge band
 * read locally — the nearest non-hill cell within `edge` steps, four ways.
 */
export function repaintThumbCells(
  cells: { floor: ArrayLike<number>; blocked: ArrayLike<number>; wall: ArrayLike<number> },
  rows: number,
  canvas: HTMLCanvasElement,
  hillShade: number,
  edge: number,
  p: Prop,
): void {
  const c = canvas.getContext("2d");
  if (!c) return;
  const n = PROP_KINDS[p.kind]?.tiles ?? 1;
  const x0 = Math.max(0, p.x), y0 = Math.max(0, p.y);
  const x1 = Math.min(COLS - 1, p.x + n - 1), y1 = Math.min(rows - 1, p.y + n - 1);
  if (x1 < x0 || y1 < y0) return;
  const img = c.createImageData(x1 - x0 + 1, y1 - y0 + 1);
  const d = img.data;
  const rgb = (css: string): [number, number, number] => [
    parseInt(css.slice(1, 3), 16),
    parseInt(css.slice(3, 5), 16),
    parseInt(css.slice(5, 7), 16),
  ];
  const hill = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < COLS && y < rows &&
    cells.blocked[y * COLS + x] !== 0 && cells.wall[y * COLS + x] !== WALL_DEEP && cells.wall[y * COLS + x] !== WALL_PROP;
  // the hill edge band's depth at a cell: steps to the nearest non-hill
  // cell along the four ways, or 0 past `edge`
  const depthAt = (x: number, y: number): number => {
    if (!hill(x, y)) return 0;
    let ring = [[x, y]];
    const seen = new Set<number>([y * COLS + x]);
    for (let k = 1; k <= edge; k++) {
      const next: number[][] = [];
      for (const [cx, cy] of ring)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!hill(nx, ny)) return k;
          const j = ny * COLS + nx;
          if (seen.has(j)) continue;
          seen.add(j);
          next.push([nx, ny]);
        }
      ring = next;
    }
    return 0;
  };
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * COLS + x;
      const floorCol = rgb(FLOOR_TONES[cells.floor[i]] ?? FLOOR_TONES[0]);
      let col: [number, number, number];
      if (cells.blocked[i] && cells.wall[i] !== WALL_DEEP) {
        if (cells.wall[i] === WALL_PROP) col = floorCol.map((v) => (v * BARE_PROP_SHADE) | 0) as [number, number, number];
        else {
          const w = rgb(WALL_TONES[cells.wall[i]] ?? WALL_TONES[0]);
          col = w.map((v) => (v * hillShade) | 0) as [number, number, number];
          if (depthAt(x, y) > 0) col = col.map((v) => (v * HILL_EDGE_SHADE) | 0) as [number, number, number];
        }
      } else col = floorCol;
      const o = ((y - y0) * (x1 - x0 + 1) + (x - x0)) * 4;
      d[o] = col[0];
      d[o + 1] = col[1];
      d[o + 2] = col[2];
      d[o + 3] = 255;
    }
  c.putImageData(img, x0, y0);
}

/** paint a MapData into a canvas at 1px per cell (scale it up with CSS) */
export function drawThumb(map: MapData, canvas: HTMLCanvasElement): void {
  // a document saved on a shorter grid draws at ITS height, so the card
  // preview keeps the map's real proportions instead of a padded band
  const rows = Math.max(1, Math.min(ROWS, Math.floor(map.floor.length / COLS)));
  paintThumb(map, rows, canvas);
  // NOTHING BUT THE GROUND. Neither the base nor the spawn zones are drawn:
  // a thumbnail is a picture of the place, and at 1px per cell a marker is a
  // coloured square sitting on the terrain that reads as an artefact rather
  // than as information. The map editor's own canvas still paints both,
  // which is where they are actually being authored
}
