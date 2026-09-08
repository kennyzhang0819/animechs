import { buildAtlas, DECOR_TILES, FLOOR_SHALLOW_WATER, SHALLOW_FOR_DEEP } from "./atlas";
import { fitZoom } from "./fit";
import {
  CELL,
  clamp,
  COLS,
  BASE_SIZE,
  H,
  ROWS,
  ENEMY_STRUCTS,
  W,
  ZONE_KINDS,
  type ZoneKind,
} from "./constants";
import { ENEMY_ICONS } from "@/components/towerIcons";
import type { EnemyKind, StructurePlacement } from "./types";
import {
  contentRows,
  ENEMY_KINDS,
  PALETTE,
  rasterizeSpawns,
  zoneStyle,
  SPAWN_RADIUS_DEFAULT,
  terrainFromMap,
  mapFromTerrain,
  type MapData,
  type PaletteSet,
  type SpawnCircle,
} from "./maps";
import { ALL_LAYERS, Renderer, type TerrainLayers } from "./renderer";
import { WALL_DEEP, WALL_PINE, type Prop, type Terrain } from "./terrain";

// THE ZOOM FLOOR IS NO LONGER COVER. It used to be 1 — "the world fills
// the viewport" — which meant the one view an author needs most, the whole
// map at once, was the one the editor refused to give: on a 256x192 board
// cover crops the long axis and you draw a shoreline you cannot see the
// shape of. The floor is now the game's own (fitZoom in fit.ts): pull back
// until the map fits inside a margin of void. Nothing is cropped and
// nothing floats.
const ZOOM_MAX = 6;
const UNDO_CAP = 40;
const PAN_KEYS: Record<string, readonly [number, number]> = {
  KeyW: [0, -1],
  KeyS: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

interface Snapshot {
  floor: Uint8Array;
  wall: Uint8Array;
  blocked: Uint8Array;
  spawns: SpawnCircle[];
  pines: Prop[];
  decor: Prop[];
  enemies: StructurePlacement[];
  base: { x: number; y: number; size: number };
}

const quarterTurn = (): number => ((Math.random() * 4) | 0) * (Math.PI / 2);

/** how wide the path tool carves, in tiles across (see PATH_WOBBLE) */
export const PATH_WIDTHS: readonly number[] = [9, 12, 15];
/** +/- tiles the carved half-width breathes along the road */
const PATH_WOBBLE = 0.9;
/** the road surface reaches this fraction of the carved half-width, so a
 * shoulder of the surrounding floor always shows between road and rock */
const PATH_SURFACE = 0.62;

/**
 * Smooth 2d value noise in [0,1] — the same lattice-and-smoothstep the map
 * generators use, so a hand-drawn road's edges wander like a generated
 * one's instead of jittering per cell. Position-seeded, so redrawing over
 * the same ground reproduces the same edge.
 */
function pathNoise(x: number, y: number): number {
  const lat = (ix: number, iy: number): number => {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + 0x51ed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = lat(ix, iy), b = lat(ix + 1, iy), c = lat(ix, iy + 1), d = lat(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * The map editor: same full-screen canvas pair and camera as the game, but
 * the left button paints terrain instead of building towers. Debug tool —
 * it never runs a Sim; it renders the terrain batch and edits it in place.
 */
/** how a brush covers its area: the full box, or a disc inside it */
export type BrushShape = "square" | "round";

export class MapEditor {
  terrain: Terrain;
  private readonly renderer: Renderer;
  private readonly uictx: CanvasRenderingContext2D;

  // active tool
  private set: PaletteSet = PALETTE[0];
  private variant = 0; // index into set.variants, used when randomize is off
  randomize = true;
  brush = 1; // painted area is (2*brush - 1) cells across
  /**
   * Square covers the whole (2r+1) box; round keeps the cells inside a disc
   * of radius r + 0.5, so the edge lands halfway through the rim cells and
   * the shape reads as a circle rather than a staircase.
   *
   * Below about five cells across the two are the same stamp — there is no
   * room for a corner to be missing — so the choice only starts to show on
   * the wide brushes it was added for.
   */
  brushShape: BrushShape = "square";
  /** index into PATH_WIDTHS — how wide the path tool carves */
  pathWidth = 1;
  /** radius in cells of the next drop zone placed, editable in the panel */
  spawnRadius = SPAWN_RADIUS_DEFAULT;
  /**
   * Layer visibility, and with it what edits may touch: a HIDDEN layer is
   * left alone by every tool. That is what lets you hide the spawn pads and
   * repaint the ground under them without wiping the pads, or hide the
   * hills and work on the floor a hill is standing on.
   */
  layers: TerrainLayers = { ...ALL_LAYERS };
  dirty = false;

  /**
   * THE MAP'S HEIGHT IN ROWS — explicit, authored, and the single thing
   * that decides where this map ends.
   *
   * It used to be implied, and that is why the boundary was so slippery: a
   * document's height was its array length, terrainFromMap padded that back
   * up to the full grid on load, mapFromTerrain re-derived it on save by
   * trimming rows that happened to look like padding, and the editor
   * painted the whole grid regardless. Four different answers to "how tall
   * is this map", none of them authoritative, and the only way to change it
   * was to paint rock in the right shape and hope the save agreed with you.
   *
   * Now it is a number you set. Everything reads it: what gets drawn, what
   * the camera may reach, which cells a brush may
   * touch, and what the save writes. Shrinking it does not destroy the rows
   * below — they stay in the arrays, unreachable and undrawn — so growing
   * the number back brings them straight back, until a save trims them for
   * good.
   */
  rows: number;

  /** the least a map may be cut to: below this there is no room to author */
  static readonly MIN_ROWS = 16;

  /** set the map's height; everything else follows on the next frame */
  setRows(n: number): void {
    const next = Math.max(MapEditor.MIN_ROWS, Math.min(ROWS, Math.floor(n)));
    if (next === this.rows) return;
    this.snapshot();
    this.rows = next;
    this.terrain.rows = next;
    // the drop zones' cells are burned from the circles against the terrain,
    // and a zone hanging off the new edge covers fewer of them
    this.resyncSpawn();
    this.renderer.rebuildTerrain(this, this.layers);
    this.clampCamera();
    this.dirty = true;
  }


  private readonly undoStack: Snapshot[] = [];

  // camera — identical model to Game: cover-scale, and a zoom that runs
  // from the whole-board fit (minZoom) up to ZOOM_MAX
  private scale = 1;
  private zoom = 1;
  private tlx = 0;
  private tly = 0;
  private camPlaced = false;
  private panning = false;
  private painting = false;
  /**
   * The drop zone this stroke is dragging, or -1. A stroke grabs ONE circle
   * when it starts and holds it until the button comes up.
   *
   * Re-running the proximity test on every cell of the stroke is what broke:
   * the moment the cursor outran the circle it had just moved, the test
   * missed and the tool dropped a FRESH zone on the ground — so one drag
   * left a trail of them instead of moving the one you grabbed.
   */
  private grabbedSpawn = -1;
  private lastCell = { x: -1, y: -1 };
  /** the swarm's structures' sprites, one image a kind, loaded on first
   *  use for the overlay — null until it has arrived */
  private readonly icons = new Map<EnemyKind, HTMLImageElement>();
  private icon(kind: EnemyKind): HTMLImageElement | null {
    let img = this.icons.get(kind);
    if (!img) {
      img = new Image();
      img.src = ENEMY_ICONS[kind];
      this.icons.set(kind, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
  private hoverGx = -1;
  private hoverGy = -1;
  private lastMouse = { x: 0, y: 0 };
  private readonly keysDown = new Set<string>();

  private raf = 0;
  private last = 0;
  private destroyed = false;

  static async create(
    glCanvas: HTMLCanvasElement,
    uiCanvas: HTMLCanvasElement,
    map: MapData,
  ): Promise<MapEditor> {
    return new MapEditor(glCanvas, uiCanvas, map, await buildAtlas());
  }

  private constructor(
    private readonly glCanvas: HTMLCanvasElement,
    private readonly uiCanvas: HTMLCanvasElement,
    private readonly map: MapData,
    atlas: HTMLCanvasElement,
  ) {
    this.terrain = terrainFromMap(map);
    this.rows = this.terrain.rows;
    this.renderer = new Renderer(glCanvas, atlas);
    const ctx = uiCanvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.uictx = ctx;

    this.resize();
    this.renderer.rebuildTerrain(this, this.layers);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWinWheel, { passive: false });
    uiCanvas.addEventListener("wheel", this.onWheel, { passive: false });
    uiCanvas.addEventListener("mousedown", this.onMouseDown);
    uiCanvas.addEventListener("mousemove", this.onMove);
    uiCanvas.addEventListener("mouseleave", this.onLeave);
    uiCanvas.addEventListener("contextmenu", this.onContext);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWinWheel);
    this.uiCanvas.removeEventListener("wheel", this.onWheel);
    this.uiCanvas.removeEventListener("mousedown", this.onMouseDown);
    this.uiCanvas.removeEventListener("mousemove", this.onMove);
    this.uiCanvas.removeEventListener("mouseleave", this.onLeave);
    this.uiCanvas.removeEventListener("contextmenu", this.onContext);
  }

  // ---------- tool state (driven by the React overlay) ----------

  setTool(set: PaletteSet, variant = 0): void {
    this.set = set;
    this.variant = variant;
  }

  toolId(): { setId: string; variant: number } {
    return { setId: this.set.id, variant: this.variant };
  }

  /** current document, for saving */
  data(): MapData {
    return mapFromTerrain(this.terrain, this.map.id, this.map.name, this.rows);
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.terrain.floor.set(s.floor);
    this.terrain.wall.set(s.wall);
    this.terrain.blocked.set(s.blocked);
    this.terrain.spawns = s.spawns;
    this.terrain.pines = s.pines;
    this.terrain.decor = s.decor;
    this.terrain.enemies = s.enemies;
    this.terrain.base = s.base;
    this.resyncSpawn();
    this.dirty = true;
    this.renderer.rebuildTerrain(this, this.layers);
  }

  /** rebuild the static batches — after a layer visibility change */
  redraw(): void {
    this.renderer.rebuildTerrain(this, this.layers);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  // ---------- painting ----------

  private snapshot(): void {
    this.undoStack.push({
      floor: this.terrain.floor.slice(),
      wall: this.terrain.wall.slice(),
      blocked: this.terrain.blocked.slice(),
      spawns: this.terrain.spawns.map((c) => ({ ...c })),
      pines: this.terrain.pines.map((p) => ({ ...p })),
      decor: this.terrain.decor.map((p) => ({ ...p })),
      enemies: this.terrain.enemies.map((e) => ({ ...e })),
      base: { ...this.terrain.base },
    });
    if (this.undoStack.length > UNDO_CAP) this.undoStack.shift();
  }

  private removePropsAt(gx: number, gy: number): void {
    const inCell = (p: Prop): boolean =>
      ((p.x / CELL) | 0) === gx && ((p.y / CELL) | 0) === gy;
    this.terrain.pines = this.terrain.pines.filter((p) => !inCell(p));
    this.terrain.decor = this.terrain.decor.filter((p) => !inCell(p));
  }

  private paintCell(gx: number, gy: number): void {
    if (gx < 0 || gy < 0 || gx >= this.terrain.cols || gy >= this.rows) return;
    const T = this.terrain;
    const i = gy * COLS + gx;
    const set = this.set;
    const pick = this.randomize && !set.noRandom
      ? set.variants[(Math.random() * set.variants.length) | 0]
      : set.variants[this.variant];
    const rot = this.randomize ? quarterTurn() : 0;
    const cx = (gx + 0.5) * CELL, cy = (gy + 0.5) * CELL;

    // a hidden layer is not just invisible, it is out of reach: these
    // guards are what make "hide it and edit underneath" work
    const L = this.layers;
    if (set.kind === "floor") {
      T.floor[i] = pick;
      if (L.wall) {
        T.blocked[i] = 0;
        T.wall[i] = 0;
      }
      if (L.props) this.removePropsAt(gx, gy);
    } else if (set.kind === "wall") {
      T.blocked[i] = 1;
      T.wall[i] = pick;
      if (L.props) this.removePropsAt(gx, gy);
    } else if (set.kind === "deep") {
      // deep water writes BOTH layers: the floor is the water surface the
      // renderer shows, and the sentinel is what blocks the swarm and
      // refuses a tower. Guarded by the wall layer like every other
      // blocking brush, so hiding the hills shields the water too
      T.floor[i] = pick;
      if (L.wall) {
        T.blocked[i] = 1;
        T.wall[i] = WALL_DEEP;
      }
      if (L.props) this.removePropsAt(gx, gy);
    } else if (set.kind === "pine") {
      T.blocked[i] = 1;
      T.wall[i] = WALL_PINE;
      this.removePropsAt(gx, gy);
      // the variant is the forest (UV_PINES) — every pine is 48px art on a
      // 32px tile, so they all overhang by the same half tile
      T.pines.push({ x: cx, y: cy, size: CELL * 1.5, rot, kind: pick });
    } else if (set.kind === "decor") {
      if (T.blocked[i]) return; // props live on open ground, like the generator's
      this.removePropsAt(gx, gy);
      T.decor.push({
        x: cx,
        y: cy,
        size: CELL * DECOR_TILES[pick], // native scale, per sprite
        rot,
        kind: pick,
      });
    } else {
      // erase: strip the VISIBLE layers, keep the floor. Hiding a layer
      // therefore also shields it from the eraser
      if (L.wall) {
        // DEEP WATER DRAINS TO SHALLOW RATHER THAN TO NOTHING. Every other
        // blocked cell has a floor underneath it that erasing reveals; deep
        // water's floor IS the water, so clearing only the block would
        // leave an unblocked cell still wearing the deep surface — water
        // the swarm walks across, which is a tile the game has no meaning
        // for. Shallow is that cell's honest answer: the same water,
        // no longer deep. Paint any land floor over it for dry ground.
        if (T.blocked[i] && T.wall[i] === WALL_DEEP)
          T.floor[i] = SHALLOW_FOR_DEEP[T.floor[i]] ?? FLOOR_SHALLOW_WATER;
        T.blocked[i] = 0;
        T.wall[i] = 0;
      }
      if (L.props) this.removePropsAt(gx, gy);
    }
    this.dirty = true;
  }

  /**
   * Re-burn the per-cell spawn layer from the circles. Every edit that moves
   * a circle OR changes what is open ground has to run this — a drop zone
   * covers the FLOOR inside it, so walling part of one off takes those cells
   * out of the swarm's entry set and carving new floor inside one adds them.
   */
  private resyncSpawn(): void {
    // written INTO the existing array, not swapped for a new one: the flow
    // field keeps the spawn mask by reference
    this.terrain.spawn.set(rasterizeSpawns(this.terrain.spawns, this.terrain));
  }

  /**
   * Drop-zone tool.
   *
   * A REGION IS ONE ZONE. If the selected region is already on the map,
   * clicking ANYWHERE moves it there — it is never stacked, never doubled.
   * The region number is an identity, not a paint colour, and every map
   * shipped is authored that way: one circle each.
   *
   * This used to require clicking INSIDE the existing circle to move it, and
   * a click on clear ground pushed a second circle carrying the same region
   * id. Nothing downstream distinguished those two circles — rasterizeSpawns
   * unions them and the level editor lists the region once — so the only
   * thing the duplicate did was make the zone impossible to move by clicking
   * where you wanted it.
   *
   * The radius follows the gesture. PICKING A ZONE UP (pressing inside it)
   * keeps its own radius, because a drag that resized what it was dragging
   * was the bug that made zones shrink out from under the cursor. SENDING IT
   * SOMEWHERE (pressing on clear ground) adopts the current radius, which is
   * also the only way to resize a zone without erasing it first.
   *
   * The eraser removes whole circles.
   */
  private spawnAt(gx: number, gy: number): void {
    if (!this.layers.spawn) return; // hidden means out of reach, like every layer
    const T = this.terrain;
    const zone = this.spawnZone();
    const x = gx + 0.5, y = gy + 0.5;

    // already dragging one: it follows the cursor and nothing else happens
    if (this.grabbedSpawn >= 0 && this.grabbedSpawn < T.spawns.length) {
      T.spawns[this.grabbedSpawn] = { ...T.spawns[this.grabbedSpawn], x, y };
      this.resyncSpawn();
      this.dirty = true;
      return;
    }

    // the zone of this KIND, wherever it currently sits — not "a circle
    // under the cursor", which is what made a second one appear.
    //
    // ONE ZONE PER KIND IS NOT THE RULE ANY MORE, though: a map may carry
    // three ground zones and two air ones. What is still true is that a
    // click on empty ground with a kind already placed should MOVE the
    // nearest one of that kind rather than stack another on top, so the
    // grab looks for the nearest same-kind circle within reach and only
    // drops a fresh one when the click lands well clear of them all.
    let hit = -1;
    let bestD = Infinity;
    T.spawns.forEach((c, i) => {
      if (c.zone !== zone) return;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= c.r && d < bestD) {
        bestD = d;
        hit = i;
      }
    });
    if (hit >= 0) {
      const z = T.spawns[hit];
      this.grabbedSpawn = hit;
      T.spawns[hit] = { ...z, x, y };
    } else {
      // fresh ground: place one at the current radius and grab it, so the
      // same press-and-drag puts it exactly where it is wanted
      this.grabbedSpawn = T.spawns.length;
      T.spawns.push({ x, y, r: this.spawnRadius, zone });
    }
    this.resyncSpawn();
    this.dirty = true;
  }

  /** the zone kind the drop-zone tool is painting — the picker's slot */
  private spawnZone(): ZoneKind {
    return ZONE_KINDS[Math.min(this.variant, ZONE_KINDS.length - 1)];
  }

  /** eraser over a drop zone: drop every circle covering this cell */
  private eraseSpawnAt(gx: number, gy: number): boolean {
    if (!this.layers.spawn) return false;
    const T = this.terrain;
    const x = gx + 0.5, y = gy + 0.5;
    const keep = T.spawns.filter((c) => Math.hypot(c.x - x, c.y - y) > c.r);
    if (keep.length === T.spawns.length) return false;
    T.spawns = keep;
    this.resyncSpawn();
    this.dirty = true;
    return true;
  }

  /**
   * One step of a path stroke: carve open ground around (gx, gy) at the
   * tool's width, wobbling the edge with position noise so the road reads
   * as carved rather than stamped, and lay the road surface down its
   * middle. Anything the carve reaches stops being wall — pads and props
   * included — which is what makes it a road and not a floor brush.
   */
  private pathAt(gx: number, gy: number): void {
    const T = this.terrain;
    const set = this.set;
    const half = PATH_WIDTHS[clamp(this.pathWidth, 0, PATH_WIDTHS.length - 1)] / 2;
    const reach = Math.ceil(half + PATH_WOBBLE) + 1;
    for (let y = gy - reach; y <= gy + reach; y++) {
      if (y < 0 || y >= ROWS) continue;
      for (let x = gx - reach; x <= gx + reach; x++) {
        if (x < 0 || x >= COLS) continue;
        const dx = x - gx, dy = y - gy;
        const d = Math.hypot(dx, dy);
        // the edge breathes with noise sampled where the cell IS, so
        // neighbouring stroke steps agree about the same piece of rim
        const edge = half + (pathNoise(x * 0.18, y * 0.18) - 0.5) * 2 * PATH_WOBBLE;
        if (d > edge) continue;
        const i = y * COLS + x;
        if (this.layers.wall) {
          T.blocked[i] = 0;
          T.wall[i] = 0;
        }
        if (this.layers.props) this.removePropsAt(x, y);
        // the surface covers the middle; the rim keeps whatever floor the
        // map already had, which is what leaves a shoulder either side
        if (d <= edge * PATH_SURFACE) {
          T.floor[i] = this.randomize
            ? set.variants[(Math.random() * set.variants.length) | 0]
            : set.variants[clamp(this.variant, 0, set.variants.length - 1)];
        }
      }
    }
    this.dirty = true;
  }

  /**
   * Move the base so its footprint is centred on the cursor. A map has one
   * base, so this is a move rather than an add: the old position simply
   * stops being the base. The ground it lands on is cleared — the footprint
   * itself plus a one-cell apron — because a base sitting in rock is one
   * the swarm can never reach.
   */
  private placeBase(gx: number, gy: number): void {
    const T = this.terrain;
    const half = (BASE_SIZE / 2) | 0;
    const x0 = clamp(gx - half, 0, COLS - BASE_SIZE);
    const y0 = clamp(gy - half, 0, ROWS - BASE_SIZE);
    for (let y = y0 - 1; y < y0 + BASE_SIZE + 1; y++)
      for (let x = x0 - 1; x < x0 + BASE_SIZE + 1; x++) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        const i = y * COLS + x;
        T.blocked[i] = 0;
        T.wall[i] = 0;
        this.removePropsAt(x, y);
        // the base always clears its own ground: a base you cannot reach is
        // a broken map, so this one ignores layer visibility
      }
    T.base = { x: x0, y: y0, size: BASE_SIZE };
    // clearing the base's ground opens cells that a drop zone overhanging it
    // would now cover, so the entry set has to be re-derived
    this.resyncSpawn();
    this.dirty = true;
  }

  /** the swarm's structure kind the enemy tool is stamping — the picker's slot */
  private enemyKind(): EnemyKind {
    return ENEMY_KINDS[Math.min(this.variant, ENEMY_KINDS.length - 1)];
  }

  /** the enemy structure whose footprint covers a cell, as an index, or -1 */
  private enemyAt(gx: number, gy: number): number {
    return this.terrain.enemies.findIndex((e) => {
      const sz = ENEMY_STRUCTS[e.kind].size;
      return gx >= e.gx && gx < e.gx + sz && gy >= e.gy && gy < e.gy + sz;
    });
  }

  /**
   * ONE OF THE SWARM'S BUILDINGS, stamped with the cursor at its middle.
   * It wants what a placed turret wants in a run (Sim.placeEnemyStructure):
   * open ground, clear of the base and of every other stamp — a stamp on
   * rock or over another simply does nothing, so a drag never piles them.
   * The drop zones are not checked here: they move, and the sim drops a
   * stamp a zone has since covered when the map loads.
   */
  private enemyStampAt(gx: number, gy: number): void {
    const T = this.terrain;
    const kind = this.enemyKind();
    const sz = ENEMY_STRUCTS[kind].size;
    const half = (sz / 2) | 0;
    const x0 = clamp(gx - half, 0, COLS - sz);
    const y0 = clamp(gy - half, 0, this.rows - sz);
    const b = T.base;
    for (let y = y0; y < y0 + sz; y++)
      for (let x = x0; x < x0 + sz; x++) {
        if (T.blocked[y * COLS + x]) return;
        if (x >= b.x && x < b.x + b.size && y >= b.y && y < b.y + b.size) return;
        if (this.enemyAt(x, y) >= 0) return;
      }
    T.enemies.push({ kind, gx: x0, gy: y0 });
    this.dirty = true;
  }

  /** eraser over one of the swarm's buildings: take the whole stamp off */
  private eraseEnemyAt(gx: number, gy: number): boolean {
    const i = this.enemyAt(gx, gy);
    if (i < 0) return false;
    this.terrain.enemies.splice(i, 1);
    this.dirty = true;
    return true;
  }

  private paintAt(gx: number, gy: number): void {
    if (this.set.kind === "base") {
      this.placeBase(gx, gy);
      return;
    }
    if (this.set.kind === "enemy") {
      this.enemyStampAt(gx, gy);
      return;
    }
    // the eraser takes a whole enemy stamp when it starts on one
    if (this.set.kind === "erase" && this.eraseEnemyAt(gx, gy)) return;
    if (this.set.kind === "path") {
      this.pathAt(gx, gy);
      return;
    }
    if (this.set.kind === "spawn") {
      this.spawnAt(gx, gy);
      return;
    }
    // the eraser takes a whole drop zone when it starts on one, rather than
    // nibbling terrain out from under it
    if (this.set.kind === "erase" && this.eraseSpawnAt(gx, gy)) return;
    const r = this.brush - 1;
    const round = this.brushShape === "round";
    const rr = (r + 0.5) * (r + 0.5);
    for (let y = gy - r; y <= gy + r; y++)
      for (let x = gx - r; x <= gx + r; x++) {
        if (round) {
          const dx = x - gx, dy = y - gy;
          if (dx * dx + dy * dy > rr) continue;
        }
        this.paintCell(x, y);
      }
    this.resyncSpawn();
  }

  /** paint every cell on the segment between two cells — no gaps on fast drags */
  private paintStroke(gx: number, gy: number): void {
    const { x: px, y: py } = this.lastCell;
    if (px < 0 || (px === gx && py === gy)) {
      this.paintAt(gx, gy);
    } else {
      const steps = Math.max(Math.abs(gx - px), Math.abs(gy - py));
      for (let s = 1; s <= steps; s++)
        this.paintAt(
          Math.round(px + ((gx - px) * s) / steps),
          Math.round(py + ((gy - py) * s) / steps),
        );
    }
    this.lastCell = { x: gx, y: gy };
    this.renderer.rebuildTerrain(this, this.layers);
  }

  // ---------- input ----------

  private readonly onResize = (): void => this.resize();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!PAN_KEYS[e.code]) return;
    e.preventDefault();
    this.keysDown.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };

  private readonly onBlur = (): void => this.keysDown.clear();

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.uiCanvas.getBoundingClientRect();
    const pinch = e.ctrlKey;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const notchy =
      e.deltaMode !== 0 ||
      (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    if (pinch || notchy) {
      const before = this.mouseWorld(e);
      this.zoom = clamp(
        this.zoom * Math.exp(-dy * (pinch ? 0.012 : 0.0015)),
        this.minZoom(),
        ZOOM_MAX,
      );
      this.tlx = before.x - ((e.clientX - r.left) / r.width) * this.visW();
      this.tly = before.y - ((e.clientY - r.top) / r.height) * this.visH();
    } else {
      this.tlx += (e.deltaX / r.width) * this.visW();
      this.tly += (e.deltaY / r.height) * this.visH();
    }
    this.clampCamera();
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && !this.panning) {
      const p = this.mouseWorld(e);
      this.snapshot();
      this.painting = true;
      this.grabbedSpawn = -1; // this stroke grabs its own zone, if any
      this.lastCell = { x: -1, y: -1 };
      this.paintStroke(clamp((p.x / CELL) | 0, 0, COLS - 1), clamp((p.y / CELL) | 0, 0, ROWS - 1));
    } else if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.painting = false;
      this.panning = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };

  private readonly onMouseUp = (): void => {
    this.panning = false;
    this.painting = false;
    this.grabbedSpawn = -1;
  };

  private readonly onMove = (e: MouseEvent): void => {
    if (this.panning) {
      const r = this.uiCanvas.getBoundingClientRect();
      this.tlx -= ((e.clientX - this.lastMouse.x) / r.width) * this.visW();
      this.tly -= ((e.clientY - this.lastMouse.y) / r.height) * this.visH();
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.clampCamera();
    }
    const p = this.mouseWorld(e);
    // OFF THE MAP IS OFF THE MAP: past the edge there is no cell to hover
    // and nothing to paint, so the cursor reports nothing rather than
    // hovering the void. The map's height is a number now (see `rows`), so
    // this is a real boundary rather than the grid's
    const gx = (p.x / CELL) | 0;
    const gy = (p.y / CELL) | 0;
    const inside = gx >= 0 && gy >= 0 && gx < this.terrain.cols && gy < this.rows;
    if (this.painting && !this.panning && inside) this.paintStroke(gx, gy);
    this.hoverGx = inside ? gx : -1;
    this.hoverGy = inside ? gy : -1;
  };

  private readonly onLeave = (): void => {
    this.hoverGx = -1;
    this.hoverGy = -1;
    this.panning = false;
    this.painting = false;
    this.grabbedSpawn = -1;
  };

  private readonly onContext = (e: Event): void => e.preventDefault();
  // pinch over a UI overlay would page-zoom the browser (sticks per-site,
  // shoves the UI off-screen) — swallow ctrl+wheel window-wide, like Game
  private readonly onWinWheel = (e: WheelEvent): void => {
    if (e.ctrlKey) e.preventDefault();
  };

  // ---------- camera ----------

  private visW(): number {
    return this.uiCanvas.width / (this.scale * this.zoom);
  }

  private visH(): number {
    return this.uiCanvas.height / (this.scale * this.zoom);
  }

  private clampCamera(): void {
    // a zero-sized canvas divides by zero in any pointer-driven pan, and a
    // NaN camera renders the map nowhere (see Game.clampCamera)
    if (!Number.isFinite(this.tlx)) this.tlx = 0;
    if (!Number.isFinite(this.tly)) this.tly = 0;
    // THE CENTRE OF THE SCREEN STAYS OVER THE MAP — the game's own rule,
    // and the reason the camera may sit in the void at all. Pinning the
    // camera inside the terrain (what this used to do) has no range left to
    // give the moment the whole map is on screen, so it would have fought
    // the new zoom floor for every pixel of the margin.
    const halfW = this.visW() / 2, halfH = this.visH() / 2;
    this.tlx = clamp(this.tlx, -halfW, this.mapW() - halfW);
    this.tly = clamp(this.tly, -halfH, this.mapH() - halfH);
  }


  /**
   * THE MAP'S OWN SIZE, in world px — what the camera bounds itself by,
   * exactly as the game does it.
   *
   * It is the map's height rather than the grid's because a document
   * shorter than the board is padded with rock on load, and bounding the
   * editor by the GRID drew that padding as if it were map: shortening a
   * map by ten rows then changed nothing you could see. Read live from the
   * terrain so that painting past the edge grows the board back — the
   * height is re-derived after every stroke (see refreshBounds).
   */
  private mapW(): number {
    return Math.max(1, Math.min(COLS, this.terrain.cols)) * CELL;
  }

  private mapH(): number {
    return this.rows * CELL;
  }

  /**
   * Re-derive the map's height from what is actually painted, the same way
   * a save does (mapFromTerrain trims trailing padding). Painting into the
   * apron below the edge makes those rows real and the board grows to meet
   * them; erasing the bottom back to bare padding shrinks it again. Called
   * after every stroke, and cheap: it walks up from the last row and stops
   * at the first row holding anything.
   */
  private refreshBounds(): void {
    const rows = contentRows(this.terrain);
    if (rows === this.terrain.rows) return;
    this.terrain.rows = rows;
    this.renderer.rebuildTerrain(this, this.layers);
    this.clampCamera();
  }

  /** the zoom at which the whole map fits, with the void margin */
  private minZoom(): number {
    return fitZoom(this.uiCanvas.width, this.uiCanvas.height, this.mapW(), this.mapH(), this.scale);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round((this.glCanvas.clientWidth || W) * dpr);
    const bh = Math.round((this.glCanvas.clientHeight || H) * dpr);
    // always recompute scale — matching backing sizes must not skip it
    // (hot-reload recreates the editor on an already-sized canvas)
    if (bw !== this.glCanvas.width || bh !== this.glCanvas.height) {
      this.glCanvas.width = bw;
      this.glCanvas.height = bh;
      this.uiCanvas.width = bw;
      this.uiCanvas.height = bh;
    }
    this.scale = Math.max(bw / W, bh / H);
    this.zoom = clamp(this.zoom, this.minZoom(), ZOOM_MAX);
    // OPEN ON THE WHOLE MAP, ONCE. The editor used to open at cover — the
    // world filling the viewport, cropped — which is the one view that
    // cannot show you the shape you are about to edit, and it hid the map's
    // own edges completely. It now opens at the zoom that fits the map with
    // the void margin around it, centred, so the board's real size is the
    // first thing on screen. Only on the first real layout: a later resize
    // (or a window drag) must not yank a camera the author has moved.
    // ...and only once the canvas has a REAL laid-out size. resize() falls
    // back to the world's own dimensions when clientWidth is still 0, which
    // is a placeholder rather than a viewport — placing the camera against
    // it burns the one placement on a size the screen never had
    if (!this.camPlaced && this.glCanvas.clientWidth > 0 && this.glCanvas.clientHeight > 0) {
      this.camPlaced = true;
      this.zoom = this.minZoom();
      this.tlx = (this.mapW() - this.visW()) / 2;
      this.tly = (this.mapH() - this.visH()) / 2;
    }
    this.clampCamera();
  }

  private mouseWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.uiCanvas.getBoundingClientRect();
    return {
      x: this.tlx + ((e.clientX - r.left) / r.width) * this.visW(),
      y: this.tly + ((e.clientY - r.top) / r.height) * this.visH(),
    };
  }

  // ---------- frame ----------

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05) || 0.016;
    this.last = now;

    for (const code of this.keysDown) {
      const dir = PAN_KEYS[code];
      this.tlx += dir[0] * this.visW() * 0.5 * dt;
      this.tly += dir[1] * this.visH() * 0.5 * dt;
    }
    if (this.keysDown.size > 0) this.clampCamera();

    this.renderer.renderTerrain(this.zoom, -this.tlx * this.zoom, -this.tly * this.zoom, this.scale);
    this.drawOverlay();
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawOverlay(): void {
    const c = this.uictx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    const s = this.scale * this.zoom;
    c.setTransform(s, 0, 0, s, -this.tlx * s, -this.tly * s);

    // Every placed drop zone. This ring is the ONLY thing marking a zone —
    // the floor inside it is drawn as plain ground — so it is drawn before
    // the hover bail-out below: a zone must not disappear the moment the
    // pointer leaves the canvas.
    if (this.layers.spawn) {
      c.lineWidth = 2 / s;
      for (const z of this.terrain.spawns) {
        c.strokeStyle = zoneStyle(z.zone).css;
        c.beginPath();
        c.arc(z.x * CELL, z.y * CELL, z.r * CELL, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // THE SWARM'S FORMATION, every stamp: a crux-red plate with the
    // building's own sprite on it. Drawn here, in the overlay, because the
    // terrain batches know nothing about structures — and before the hover
    // bail-out, since a stamp must not vanish when the pointer leaves
    for (const e of this.terrain.enemies) {
      const side = ENEMY_STRUCTS[e.kind].size * CELL;
      const x0 = e.gx * CELL, y0 = e.gy * CELL;
      c.fillStyle = "rgba(242,85,85,0.28)";
      c.fillRect(x0, y0, side, side);
      c.strokeStyle = "rgba(242,85,85,0.9)";
      c.lineWidth = 1.5 / s;
      c.strokeRect(x0, y0, side, side);
      const img = this.icon(e.kind);
      if (img) {
        c.imageSmoothingEnabled = false;
        c.drawImage(img, x0 + side * 0.1, y0 + side * 0.1, side * 0.8, side * 0.8);
      }
    }

    // everything below previews the tool under the cursor, so it needs one
    if (this.hoverGx < 0) return;

    if (this.set.kind === "enemy") {
      const kind = this.enemyKind();
      const sz = ENEMY_STRUCTS[kind].size;
      const half = (sz / 2) | 0;
      const x0 = clamp(this.hoverGx - half, 0, COLS - sz) * CELL;
      const y0 = clamp(this.hoverGy - half, 0, this.rows - sz) * CELL;
      const side = sz * CELL;
      c.fillStyle = "rgba(242,85,85,0.18)";
      c.fillRect(x0, y0, side, side);
      c.strokeStyle = "rgba(242,85,85,0.9)";
      c.lineWidth = 2 / s;
      c.strokeRect(x0, y0, side, side);
      return;
    }
    // the path tool is round and much wider than a brush — preview it as
    // the circle it actually carves
    if (this.set.kind === "base") {
      const half = (BASE_SIZE / 2) | 0;
      const x0 = clamp(this.hoverGx - half, 0, COLS - BASE_SIZE) * CELL;
      const y0 = clamp(this.hoverGy - half, 0, ROWS - BASE_SIZE) * CELL;
      const side = BASE_SIZE * CELL;
      c.fillStyle = "rgba(255,211,127,0.18)";
      c.fillRect(x0, y0, side, side);
      c.strokeStyle = "rgba(255,211,127,0.9)";
      c.lineWidth = 2 / s;
      c.strokeRect(x0, y0, side, side);
      return;
    }
    if (this.set.kind === "spawn") {
      const col = zoneStyle(this.spawnZone()).css;
      c.beginPath();
      c.arc((this.hoverGx + 0.5) * CELL, (this.hoverGy + 0.5) * CELL, this.spawnRadius * CELL, 0, Math.PI * 2);
      c.fillStyle = col + "22";
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = 2 / s;
      c.stroke();
      return;
    }
    if (this.set.kind === "path") {
      const rad = (PATH_WIDTHS[clamp(this.pathWidth, 0, PATH_WIDTHS.length - 1)] / 2) * CELL;
      c.beginPath();
      c.arc((this.hoverGx + 0.5) * CELL, (this.hoverGy + 0.5) * CELL, rad, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,211,127,0.12)";
      c.fill();
      c.strokeStyle = "rgba(255,211,127,0.85)";
      c.lineWidth = 1.5 / s;
      c.stroke();
      return;
    }
    const r = this.brush - 1;
    const x = (this.hoverGx - r) * CELL, y = (this.hoverGy - r) * CELL;
    const side = (2 * r + 1) * CELL;
    c.fillStyle = this.set.kind === "erase" ? "rgba(255,90,90,0.18)" : "rgba(255,211,127,0.14)";
    c.strokeStyle = this.set.kind === "erase" ? "rgba(255,90,90,0.9)" : "rgba(255,211,127,0.85)";
    c.lineWidth = 1.5 / s;
    if (this.brushShape === "round") {
      // the same disc the paint loop walks, drawn from the cursor cell's
      // centre — so what is outlined is exactly what a click would change
      c.beginPath();
      c.arc(
        (this.hoverGx + 0.5) * CELL,
        (this.hoverGy + 0.5) * CELL,
        (r + 0.5) * CELL,
        0,
        Math.PI * 2,
      );
      c.fill();
      c.stroke();
      return;
    }
    c.fillRect(x, y, side, side);
    c.strokeRect(x, y, side, side);
  }
}
