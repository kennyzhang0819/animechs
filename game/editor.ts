import { buildAtlas, DECOR_TILES, FLOOR_SHALLOW_WATER, SHALLOW_FOR_DEEP } from "./atlas";
import { fitZoom } from "./fit";
import {
  CELL,
  clamp,
  COLS,
  BASE_SIZE,
  H,
  MAX_BEACONS,
  BEACON_POWER_R,
  BEACON_SIZE,
  ROWS,
  TOWERS,
  W,
} from "./constants";
import {
  contentRows,
  SPAWN_STYLE,
  PALETTE,
  terrainFromMap,
  mapFromTerrain,
  type MapData,
  type PaletteSet,
} from "./maps";
import { ALL_LAYERS, Renderer, type TerrainLayers } from "./renderer";
import { loadInvertZoom } from "./progress";
import { canHoldSpawn, isWaterFloor } from "./terrain";
import { WALL_DEEP, WALL_PINE, type MapBeacon, type Prop, type Terrain } from "./terrain";

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
  spawn: Uint8Array;
  pines: Prop[];
  decor: Prop[];
  beacons: MapBeacon[];
  /** the map's beacon price ladder (maps.ts MapData.beaconPrices) — it is
   *  edited in a panel rather than painted, and an author who types a rung
   *  by mistake wants the same Ctrl+Z every brush stroke has */
  beaconPrices: number[];
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
  private lastCell = { x: -1, y: -1 };

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
    this.invertZoom = loadInvertZoom(); // the player's own zoom direction
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
    this.terrain.spawn.set(s.spawn);
    this.terrain.pines = s.pines;
    this.terrain.decor = s.decor;
    this.terrain.beacons = s.beacons;
    this.terrain.beaconPrices = s.beaconPrices;
    this.terrain.base = s.base;
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
      spawn: this.terrain.spawn.slice(),
      pines: this.terrain.pines.map((p) => ({ ...p })),
      decor: this.terrain.decor.map((p) => ({ ...p })),
      beacons: this.terrain.beacons.map((r) => ({ ...r })),
      beaconPrices: [...this.terrain.beaconPrices],
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
    if (set.kind === "spawn") {
      // A SPAWN TILE CANNOT BE A HILL (terrain.ts canHoldSpawn) — painting
      // one onto rock or forest is a no-op rather than a pad the loader
      // would silently take back; carve the ground first. Deep water takes
      // one, because the deep is where a fleet comes in.
      if (L.spawn && canHoldSpawn(T.blocked[i], T.wall[i])) T.spawn[i] = 1;
    } else if (set.kind === "floor") {
      T.floor[i] = pick;
      if (L.wall) {
        T.blocked[i] = 0;
        T.wall[i] = 0;
      }
      if (L.props) this.removePropsAt(gx, gy);
      // a water floor drowns the vein; a land floor keeps it
    } else if (set.kind === "wall") {
      T.blocked[i] = 1;
      T.wall[i] = pick;
      T.spawn[i] = 0;
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
        // ...and the pad on it STAYS: the deep is the naval layer's road,
        // so a door out at sea is a door (terrain.ts canHoldSpawn)
      }
      if (L.props) this.removePropsAt(gx, gy);
    } else if (set.kind === "pine") {
      T.blocked[i] = 1;
      T.wall[i] = WALL_PINE;
      T.spawn[i] = 0;
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
      // therefore also shields it from the eraser. The ore goes with them
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
      // ...and the pads, which are a layer of their own: hiding the spawn
      // layer shields them from the eraser exactly as hiding the hills
      // shields the rock
      if (L.spawn) T.spawn[i] = 0;
      // ...AND THE BEACONS, for the same reason and by the same rule. A
      // beacon used to be removable only by clicking it with the Beacon
      // brush in hand, which is a gesture nobody guesses: the eraser is
      // the tool that takes things off a map, and a beacon is a thing on
      // the map. Its whole footprint goes when the stroke touches any cell
      // of it — erasing two thirds of a three-cell block would leave a
      // beacon standing that the author was plainly rubbing out
      if (L.beacon) this.removeBeaconAt(gx, gy);
    }
    this.dirty = true;
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
  /**
   * STAMP A BEACON HERE, or take the one that is already here back off.
   *
   * ONE CLICK, BOTH WAYS, because a beacon is a point and not a stroke:
   * there is no brush size, no drag and nothing to erase over. Clicking a
   * beacon removes it, which is the only gesture an author needs and the
   * one they will reach for.
   *
   * IT LANDS ON ROCK AND NOWHERE ELSE. A beacon stands on a hill precisely
   * so that nothing can reach it (terrain.ts MapBeacon) — one placed on
   * open ground would be a beacon in the swarm's way, which is a promise
   * this game does not keep about them. A click on floor does nothing
   * rather than raising rock to oblige: the author asked for a beacon, not
   * for terrain.
   *
   * IT CARRIES NO PRICE. What a beacon costs is the map's ladder and not
   * this beacon's business (maps.ts MapData.beaconPrices): every one on
   * the board is offered at the same rung, and buying any of them moves
   * the rest up. Placing one changes what the LAST rung of a full sweep
   * costs, which is why the price panel counts the beacons beside it.
   */
  private toggleBeacon(gx: number, gy: number): void {
    // a hidden beacon layer is out of reach, exactly like the others
    if (!this.layers.beacon) return;
    const T = this.terrain;
    const half = (BEACON_SIZE / 2) | 0;
    const x0 = clamp(gx - half, 0, COLS - BEACON_SIZE);
    const y0 = clamp(gy - half, 0, ROWS - BEACON_SIZE);
    // a click anywhere on a standing beacon takes it off
    if (this.removeBeaconAt(gx, gy)) return;
    if (T.beacons.length >= MAX_BEACONS) return;
    // every cell of the footprint has to be rock, and none of it a tree:
    // a pine is a prop the swarm can clear out from under it
    for (let y = y0; y < y0 + BEACON_SIZE; y++)
      for (let x = x0; x < x0 + BEACON_SIZE; x++) {
        const i = y * COLS + x;
        if (!T.blocked[i] || T.wall[i] === WALL_PINE) return;
      }
    T.beacons.push({ x: x0, y: y0 });
    this.dirty = true;
  }

  /**
   * TAKE THE BEACON STANDING ON THIS CELL OFF, if one is — the whole
   * three-cell block, whichever of its cells was hit. Says whether it
   * removed one, which is what lets the Beacon brush use it as the first
   * half of its toggle and the eraser use it on its own.
   */
  private removeBeaconAt(gx: number, gy: number): boolean {
    const rs = this.terrain.beacons;
    const hit = rs.findIndex(
      (r) => gx >= r.x && gx < r.x + BEACON_SIZE && gy >= r.y && gy < r.y + BEACON_SIZE,
    );
    if (hit < 0) return false;
    rs.splice(hit, 1);
    this.dirty = true;
    return true;
  }

  /** this map's beacon price ladder, rung by rung (maps.ts
   *  MapData.beaconPrices) — what the panel prints */
  beaconLadder(): readonly number[] {
    return this.terrain.beaconPrices;
  }

  /** how many beacons are standing — how many rungs of the ladder this
   *  board can actually reach (the last rung repeats past the end) */
  beaconCount(): number {
    return this.terrain.beacons.length;
  }

  /**
   * WRITE THE LADDER. Undoable like a stroke, because typing a rung is an
   * edit to the map and Ctrl+Z is what an author reaches for after any
   * edit they did not mean. Rungs are whole scrap and never negative; an
   * empty ladder would make every beacon on the board free, so the panel's
   * last rung cannot be removed (see MapEditorView).
   *
   * ONE SNAPSHOT PER BURST OF TYPING, not one per keystroke. A number
   * field fires on every character, so snapshotting each call would fill
   * the whole forty-deep stack with "3", "30", "300" and throw away every
   * brush stroke behind them. A second's pause is a new edit, which is the
   * granularity a text field has taught everyone to expect.
   */
  private ladderEditAt = -Infinity;

  setBeaconLadder(rungs: readonly number[]): void {
    const now = performance.now();
    if (now - this.ladderEditAt > 1000) this.snapshot();
    this.ladderEditAt = now;
    this.terrain.beaconPrices = rungs
      .slice(0, MAX_BEACONS)
      .map((v) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0));
    this.dirty = true;
  }

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
        T.spawn[i] = 0;
        this.removePropsAt(x, y);
        // the base always clears its own ground: a base you cannot reach is
        // a broken map, so this one ignores layer visibility. The pads go
        // with the rock — a door under the core is a door that has already
        // arrived
      }
    T.base = { x: x0, y: y0, size: BASE_SIZE };
    this.dirty = true;
  }



  private paintAt(gx: number, gy: number): void {
    if (this.set.kind === "base") {
      this.placeBase(gx, gy);
      return;
    }
    if (this.set.kind === "beacon") {
      this.toggleBeacon(gx, gy);
      return;
    }
    if (this.set.kind === "path") {
      this.pathAt(gx, gy);
      return;
    }
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

  /** the Controls tab's zoom direction, read off the save at construction */
  private readonly invertZoom: boolean;

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = this.uiCanvas.getBoundingClientRect();
    // two fingers pan and a wheel zooms, told apart the same way the field
    // tells them apart — see Game.onWheel for why it is the SHAPE of the
    // delta and not its size. The editor has no settings screen of its
    // own, so it reads the player's zoom direction off the save at
    // construction (invertZoom).
    const pinch = e.ctrlKey;
    const trackpad =
      e.deltaMode === 0 && (e.deltaX !== 0 || !Number.isInteger(e.deltaY));
    if (!pinch && trackpad) {
      this.tlx += (e.deltaX / r.width) * this.visW();
      this.tly += (e.deltaY / r.height) * this.visH();
      this.clampCamera();
      return;
    }
    let dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (this.invertZoom) dy = -dy;
    const before = this.mouseWorld(e);
    this.zoom = clamp(
      this.zoom * Math.exp(-dy * (pinch ? 0.012 : 0.0015)),
      this.minZoom(),
      ZOOM_MAX,
    );
    this.tlx = before.x - ((e.clientX - r.left) / r.width) * this.visW();
    this.tly = before.y - ((e.clientY - r.top) / r.height) * this.visH();
    this.clampCamera();
  };

  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && !this.panning) {
      const p = this.mouseWorld(e);
      this.snapshot();
      this.painting = true;
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

    // THE BEACONS THIS MAP CARRIES, whatever brush is in hand — they are a
    // layer of the document and an author has to be able to see the shape
    // they make without holding the brush that draws them. Each with the
    // circle of ground it opens, because a beacon is that circle: two of
    // them whose discs overlap completely are one beacon and a wasted
    // price. Hiding the layer hides them, and puts them out of reach of
    // every tool (renderer.ts TerrainLayers.beacon).
    //
    // NO PRICE IS DRAWN ON THEM ANY MORE. Each one used to wear its own
    // four-figure number here, and that number no longer exists: a beacon
    // costs whichever rung of the map's ladder the run has reached
    // (constants.ts BEACON_LADDER), so a price painted on one hill would
    // be a lie about every other. The ladder is read in its own panel.
    //
    // On the OVERLAY rather than in the terrain batch (Renderer.
    // rebuildTerrain) because beacons are not tiles — they are a list of
    // blocks with a circle each.
    if (this.layers.beacon && this.terrain.beacons.length > 0) {
      const side = BEACON_SIZE * CELL;
      c.setLineDash([12 / s, 10 / s]);
      c.strokeStyle = "rgba(255,211,127,0.35)";
      c.lineWidth = 1.5 / s;
      for (const r of this.terrain.beacons) {
        c.beginPath();
        c.arc((r.x + BEACON_SIZE / 2) * CELL, (r.y + BEACON_SIZE / 2) * CELL, BEACON_POWER_R, 0, Math.PI * 2);
        c.stroke();
      }
      c.setLineDash([]);
      c.fillStyle = "rgba(255,211,127,0.85)";
      c.strokeStyle = "rgba(20,14,4,0.9)";
      c.lineWidth = 1.5 / s;
      for (const r of this.terrain.beacons) {
        c.fillRect(r.x * CELL, r.y * CELL, side, side);
        c.strokeRect(r.x * CELL, r.y * CELL, side, side);
      }
    }

    // NOTHING MARKS THE SPAWN LAYER HERE ANY MORE. It used to be a ring per
    // drop zone, drawn over plain ground; the tiles are painted now, so the
    // terrain pass draws them (Renderer.rebuildTerrain) and the overlay is
    // back to being nothing but the cursor.
    if (this.hoverGx < 0) return;

    // THE FORMATION GHOST: the whole outpost under the cursor, turned the
    // way the rotate key has it, so what you see is what lands
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
    if (this.set.kind === "beacon") {
      const half = (BEACON_SIZE / 2) | 0;
      const x0 = clamp(this.hoverGx - half, 0, COLS - BEACON_SIZE) * CELL;
      const y0 = clamp(this.hoverGy - half, 0, ROWS - BEACON_SIZE) * CELL;
      const side = BEACON_SIZE * CELL;
      c.fillStyle = "rgba(255,211,127,0.25)";
      c.fillRect(x0, y0, side, side);
      c.strokeStyle = "rgba(255,211,127,0.9)";
      c.lineWidth = 2 / s;
      c.strokeRect(x0, y0, side, side);
      // ...and the circle it would open, which is the whole reason to care
      // where it goes
      c.beginPath();
      c.arc(x0 + side / 2, y0 + side / 2, BEACON_POWER_R, 0, Math.PI * 2);
      c.setLineDash([12 / s, 10 / s]);
      c.lineWidth = 1.5 / s;
      c.stroke();
      c.setLineDash([]);
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
    // the spawn brush wears the spawn layer's own colour, so a stroke is
    // recognisable as pads before it is painted (SPAWN_STYLE)
    const k = this.set.kind;
    c.fillStyle = k === "erase" ? "rgba(255,90,90,0.18)"
      : k === "spawn" ? "rgba(230,83,66,0.22)" : "rgba(255,211,127,0.14)";
    c.strokeStyle = k === "erase" ? "rgba(255,90,90,0.9)"
      : k === "spawn" ? SPAWN_STYLE.css : "rgba(255,211,127,0.85)";
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
