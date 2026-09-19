import { buildAtlas, DECOR_TILES, FLOOR_SHALLOW_WATER, SHALLOW_FOR_DEEP, towerIcon, unitIcon } from "./atlas";
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
import {
  MARK_KINDS, MARK_TOWERS, MARK_UNITS, MAX_MARKS, markKind, markOpts, markTower, markUnit,
  type MapMark, type MarkKind,
} from "./missionMarks";
import { unitAccent } from "./levels";
import { MIN_RUN, pathProblems } from "./missions";
import { canHoldSpawn, isWaterFloor, rebuildReserved } from "./terrain";
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
  marks: MapMark[];
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

/** the eight headings a leg may run on — the lattice (missions.ts) */
const LATTICE: readonly (readonly [number, number])[] = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];

/**
 * THE NEAREST CELL TO `want` THAT KEEPS ITS LEGS ON THE LATTICE, or null
 * where there is no such cell.
 *
 * A corner in the middle of a road is constrained from BOTH sides, so the
 * places it may stand are the intersections of one of the eight rays out
 * of its neighbour before it with one out of the neighbour after — 64
 * pairs, of which the parallel ones and the ones that meet on a half cell
 * are dropped. An end corner has one neighbour and therefore eight rays.
 *
 * SNAPPING RATHER THAN REFUSING is the whole point: the lattice is a rule
 * about what can be DRAWN (missions.ts, roadProblems), and a rule a
 * person has to satisfy by hand with a mouse is a rule they will fight.
 * Dragging a corner here cannot produce an illegal road.
 */
export function snapLattice(
  want: readonly [number, number],
  prev: readonly [number, number] | null,
  next: readonly [number, number] | null,
): [number, number] | null {
  const out: [number, number][] = [];
  const ray = (a: readonly [number, number], d: readonly [number, number]): [number, number] | null => {
    const len = d[0] * d[0] + d[1] * d[1];
    const t = Math.round(((want[0] - a[0]) * d[0] + (want[1] - a[1]) * d[1]) / len);
    if (t < MIN_RUN) return null;
    return [a[0] + d[0] * t, a[1] + d[1] * t];
  };
  if (prev && next) {
    for (const d1 of LATTICE)
      for (const d2 of LATTICE) {
        const den = d1[0] * d2[1] - d1[1] * d2[0];
        if (den === 0) continue;
        const rx = next[0] - prev[0], ry = next[1] - prev[1];
        const t1 = (rx * d2[1] - ry * d2[0]) / den;
        if (!Number.isInteger(t1) || t1 < MIN_RUN) continue;
        const p: [number, number] = [prev[0] + d1[0] * t1, prev[1] + d1[1] * t1];
        const back = Math.max(Math.abs(p[0] - next[0]), Math.abs(p[1] - next[1]));
        if (back < MIN_RUN) continue;
        out.push(p);
      }
  } else {
    const a = prev ?? next;
    if (!a) return [Math.round(want[0]), Math.round(want[1])];
    for (const d of LATTICE) {
      const p = ray(a, d);
      if (p) out.push(p);
    }
  }
  let best: [number, number] | null = null, bestD = Infinity;
  for (const p of out) {
    const d = (p[0] - want[0]) ** 2 + (p[1] - want[1]) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** how far (in cells) a cell is from the segment a-b */
function distToLeg(
  gx: number, gy: number,
  a: readonly [number, number], b: readonly [number, number],
): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((gx - a[0]) * dx + (gy - a[1]) * dy) / len));
  return Math.hypot(a[0] + dx * t - gx, a[1] + dy * t - gy);
}

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
    this.loadMarkArt();

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
    // picking another brush ends a line half drawn, so a road cannot be
    // left with one corner in it waiting for a click that never comes
    if (set.id !== this.set.id) this.endPath();
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
    this.terrain.marks = s.marks;
    rebuildReserved(this.terrain);
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
      marks: this.terrain.marks.map((r) => ({ ...r, pts: r.pts?.map((p) => [p[0], p[1]] as [number, number]), opts: { ...r.opts } })),
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
      if (L.mark) this.removeMarkAt(gx, gy);
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
   * IT CARRIES NO PRICE, AND NEITHER DOES THE MAP. What a beacon costs is
   * the campaign's one rising ladder (constants.ts BEACON_LADDER): every
   * beacon on every board is offered at the rung the run has reached, and
   * buying any of them moves the rest up. Placing one here decides where
   * a run may spread to and how dear the last acre is — nothing about
   * price, which is why this editor has no price field anywhere in it.
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

  /**
   * STAMP A MISSION MARK, or take one off — the beacon's toggle, over the
   * registry (missionMarks.ts).
   *
   * IT ASKS LESS OF THE GROUND THAN A BEACON DOES. A beacon has to stand
   * on rock because that is what it means; a mark is a place a mission
   * will put something, and which ground that needs is the mission's
   * business, not the brush's. What is refused is only what would be a
   * mark nobody could ever see or use: off the board, or on top of one
   * that is already there.
   *
   * A CLICK ON A STANDING MARK SELECTS IT rather than removing it, because
   * the fields are the point — an author places one and then says which
   * tower it is and which train wave it rises on. The eraser is how one
   * comes off.
   */
  private toggleMark(gx: number, gy: number): void {
    if (!this.layers.mark) return;
    const kind = markKind(this.set.mark ?? "");
    if (!kind) return;
    const hit = this.markAt(gx, gy);
    if (hit >= 0) {
      this.picked = hit;
      return;
    }
    if (this.terrain.marks.length >= MAX_MARKS) return;
    const half = (kind.size / 2) | 0;
    const x0 = clamp(gx - half, 0, COLS - kind.size);
    const y0 = clamp(gy - half, 0, ROWS - kind.size);
    // no two marks may overlap: two things in one place is an author who
    // cannot click the one underneath
    for (const m of this.terrain.marks) {
      const k = markKind(m.kind);
      if (!k) continue;
      if (x0 < m.x + k.size && x0 + kind.size > m.x && y0 < m.y + k.size && y0 + kind.size > m.y)
        return;
    }
    this.terrain.marks.push({ kind: kind.id, x: x0, y: y0, opts: markOpts(kind, undefined) });
    this.picked = this.terrain.marks.length - 1;
    rebuildReserved(this.terrain);
    this.dirty = true;
  }

  /** the mark whose footprint — or, for a road, whose corner or leg —
   *  covers this cell, or -1 */
  private markAt(gx: number, gy: number): number {
    return this.terrain.marks.findIndex((m) => {
      const k = markKind(m.kind);
      if (!k) return false;
      if (k.geom === "path") return this.pathHit(m, gx, gy) !== null;
      return gx >= m.x && gx < m.x + k.size && gy >= m.y && gy < m.y + k.size;
    });
  }

  /**
   * WHAT OF A ROAD IS UNDER THIS CELL: one of its corners (the handle an
   * author drags), a leg (where a click puts a new corner in), or
   * nothing. A corner wins over the leg it sits on, because a corner is
   * the smaller target and the one being aimed at.
   */
  private pathHit(m: MapMark, gx: number, gy: number): { corner: number } | { leg: number } | null {
    const pts = m.pts ?? [];
    const grab = markKind(m.kind)?.size ?? 3;
    let best = -1, bestD = grab;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0] - gx, pts[i][1] - gy);
      if (d <= bestD) { bestD = d; best = i; }
    }
    if (best >= 0) return { corner: best };
    for (let i = 1; i < pts.length; i++)
      if (distToLeg(gx, gy, pts[i - 1], pts[i]) <= 2) return { leg: i };
    return null;
  }

  /**
   * A ROAD, DRAWN AS THE LINE IT IS: the legs, a handle on every corner,
   * the selected road brighter with its name at the entry, and anything
   * the lattice refuses said in red under it (missions.ts pathProblems).
   * The line an author is still drawing dashes from its last corner to
   * the cursor, snapped, so what the next click will do is visible before
   * it happens.
   */
  private drawPathMark(
    c: CanvasRenderingContext2D,
    m: MapMark,
    k: MarkKind,
    i: number,
    s: number,
  ): void {
    const pts = m.pts ?? [];
    if (pts.length === 0) return;
    const on = i === this.picked;
    const px = (v: number): number => (v + 0.5) * CELL;
    c.strokeStyle = k.color;
    c.globalAlpha = on ? 1 : 0.55;
    c.lineWidth = (on ? 3 : 2) / s;
    c.beginPath();
    c.moveTo(px(pts[0][0]), px(pts[0][1]));
    for (let j = 1; j < pts.length; j++) c.lineTo(px(pts[j][0]), px(pts[j][1]));
    c.stroke();
    // where the next click would put a corner, while one is being drawn
    if (i === this.drawing && this.hoverGx >= 0) {
      const at = snapLattice([this.hoverGx, this.hoverGy], pts[pts.length - 1], null);
      if (at) {
        c.setLineDash([6 / s, 4 / s]);
        c.beginPath();
        c.moveTo(px(pts[pts.length - 1][0]), px(pts[pts.length - 1][1]));
        c.lineTo(px(at[0]), px(at[1]));
        c.stroke();
        c.setLineDash([]);
      }
    }
    const h = (k.size * CELL) / 2;
    const face = this.markArt.get(k.tower ?? k.unit);
    for (let j = 0; j < pts.length; j++) {
      c.fillStyle = k.color;
      c.fillRect(px(pts[j][0]) - h, px(pts[j][1]) - h, h * 2, h * 2);
      c.strokeStyle = "rgba(10,10,14,0.9)";
      c.lineWidth = 1.5 / s;
      c.strokeRect(px(pts[j][0]) - h, px(pts[j][1]) - h, h * 2, h * 2);
    }
    // the ENTRY wears the face of what walks the line — one portrait a
    // road and not one a corner, because a corner is a handle
    if (face) c.drawImage(face, px(pts[0][0]) - h * 1.5, px(pts[0][1]) - h * 1.5, h * 3, h * 3);
    c.globalAlpha = 1;
    if (!on) return;
    const bad = pathProblems(pts);
    c.font = `${Math.round(CELL * 1.6)}px monospace`;
    c.textAlign = "left";
    const lines = [`${i}: ${m.opts?.name ?? k.label}`, ...bad];
    let ty = px(pts[0][1]) + CELL * 3;
    for (const [n, line] of lines.entries()) {
      c.fillStyle = n === 0 ? "#ffffff" : "#ff6b6b";
      c.strokeStyle = "rgba(10,10,14,0.9)";
      c.lineWidth = 4 / s;
      c.strokeText(line, px(pts[0][0]) + CELL * 2, ty);
      c.fillText(line, px(pts[0][0]) + CELL * 2, ty);
      ty += CELL * 2;
    }
    c.textAlign = "center";
  }

  /**
   * A CLICK WITH THE ROAD BRUSH IN HAND. Returns true when it was this
   * tool's to answer, so the ordinary paint stroke never runs under it.
   *
   *   on a corner       select the road and take hold of that corner
   *   on a leg          put a new corner in there and take hold of it
   *   while drawing     add the next corner, snapped off the last one
   *   anywhere else     start a new road there
   *
   * Clicking the corner a road is being drawn from FINISHES it, which is
   * the gesture every polyline tool has; so does Enter, and so does
   * picking another brush.
   */
  private pathClick(gx: number, gy: number): boolean {
    const kind = markKind(this.set.mark ?? "");
    if (!kind || kind.geom !== "path" || !this.layers.mark) return false;
    // drawing: the next corner, or the end of the line
    const drawn = this.drawing >= 0 ? this.terrain.marks[this.drawing] : null;
    if (drawn?.pts) {
      const last = drawn.pts[drawn.pts.length - 1];
      if (Math.hypot(last[0] - gx, last[1] - gy) <= kind.size) { this.endPath(); return true; }
      const at = snapLattice([gx, gy], last, null);
      if (at) this.setPts(this.drawing, [...drawn.pts, at]);
      return true;
    }
    for (let i = 0; i < this.terrain.marks.length; i++) {
      const m = this.terrain.marks[i];
      if (markKind(m.kind)?.geom !== "path") continue;
      const hit = this.pathHit(m, gx, gy);
      if (!hit) continue;
      this.picked = i;
      if ("corner" in hit) { this.pathDrag = { mark: i, corner: hit.corner }; return true; }
      const pts = [...(m.pts ?? [])];
      const at = snapLattice([gx, gy], pts[hit.leg - 1], pts[hit.leg]) ?? [gx, gy];
      pts.splice(hit.leg, 0, at);
      this.setPts(i, pts);
      this.pathDrag = { mark: i, corner: hit.leg };
      return true;
    }
    if (this.terrain.marks.length >= MAX_MARKS) return true;
    this.terrain.marks.push({ kind: kind.id, x: gx, y: gy, pts: [[gx, gy]], opts: markOpts(kind, undefined) });
    this.picked = this.terrain.marks.length - 1;
    this.drawing = this.picked;
    this.dirty = true;
    this.redraw();
    return true;
  }

  /** move the corner being dragged, if the lattice allows it there */
  private pathDragTo(gx: number, gy: number): void {
    const d = this.pathDrag;
    if (!d) return;
    const m = this.terrain.marks[d.mark];
    const pts = m?.pts;
    if (!pts) return;
    const at = snapLattice([gx, gy], pts[d.corner - 1] ?? null, pts[d.corner + 1] ?? null);
    if (!at || (at[0] === pts[d.corner][0] && at[1] === pts[d.corner][1])) return;
    const next = [...pts];
    next[d.corner] = at;
    this.setPts(d.mark, next);
  }

  /** a road's corners, replaced whole — `x`/`y` follow the first one so
   *  every reader that only wants a place still has one */
  private setPts(i: number, pts: readonly (readonly [number, number])[]): void {
    const m = this.terrain.marks[i];
    if (!m) return;
    this.terrain.marks[i] = { ...m, x: pts[0][0], y: pts[0][1], pts };
    this.dirty = true;
    this.redraw();
  }

  /** stop drawing — and throw away a line of one corner, which is nothing */
  endPath(): void {
    const i = this.drawing;
    this.drawing = -1;
    if (i < 0) return;
    const m = this.terrain.marks[i];
    if (m && (m.pts?.length ?? 0) < 2) {
      this.terrain.marks.splice(i, 1);
      if (this.picked === i) this.picked = -1;
    }
    this.dirty = true;
    this.redraw();
  }

  /**
   * EVERY FACE A MISSION MARK MAY WEAR, carved off the atlas once and kept
   * (missionMarks.ts MARK_UNITS). They arrive late — the sheet has to be
   * built and a cell composited per body — so the map draws the plain
   * plate until each one lands and then redraws.
   */
  private readonly markArt = new Map<string, HTMLImageElement>();

  private loadMarkArt(): void {
    // a mark that stands a TURRET up wears that turret's head instead of a
    // body's portrait (missionMarks.ts markTower)
    for (const kind of MARK_TOWERS)
      void towerIcon(kind)
        .then((url) => {
          const img = new Image();
          img.onload = () => {
            this.markArt.set(kind, img);
            this.redraw();
          };
          img.src = url;
        })
        .catch(() => {});
    for (const kind of MARK_UNITS)
      void unitIcon(kind, unitAccent(kind))
        .then((url) => {
          const img = new Image();
          img.onload = () => {
            this.markArt.set(kind, img);
            this.redraw();
          };
          img.src = url;
        })
        .catch(() => {
          // no portrait: the plate is the fallback and says the same thing
          // in colour
        });
  }

  /** the road being drawn, or -1 */
  private drawing = -1;
  private pathDrag: { mark: number; corner: number } | null = null;

  /** take the mark on this cell off, if there is one — what the eraser
   *  calls, and the only way one comes off */
  private removeMarkAt(gx: number, gy: number): boolean {
    const hit = this.markAt(gx, gy);
    if (hit < 0) return false;
    // A ROAD LOSES THE CORNER UNDER THE ERASER, not the whole line —
    // until it is down to the two a line needs, and then it goes
    const m = this.terrain.marks[hit];
    if (markKind(m.kind)?.geom === "path" && m.pts && m.pts.length > 2) {
      const at = this.pathHit(m, gx, gy);
      if (at && "corner" in at) {
        this.setPts(hit, m.pts.filter((_, i) => i !== at.corner));
        return true;
      }
    }
    this.terrain.marks.splice(hit, 1);
    if (this.picked === hit) this.picked = -1;
    else if (this.picked > hit) this.picked--;
    rebuildReserved(this.terrain);
    this.dirty = true;
    return true;
  }

  // ---- what the panel talks to ----
  /** which mark the author has selected, or -1 */
  private picked = -1;
  /** the selected mark and its kind, for the panel to render fields from */
  selected(): { i: number; mark: MapMark; kind: MarkKind } | null {
    const m = this.terrain.marks[this.picked];
    const k = m ? markKind(m.kind) : null;
    return m && k ? { i: this.picked, mark: m, kind: k } : null;
  }
  /** set one field on the selected mark — the panel's only write */
  setMarkOpt(key: string, value: string | number): void {
    const sel = this.selected();
    if (!sel) return;
    this.snapshot();
    sel.mark.opts = { ...sel.mark.opts, [key]: value };
    this.dirty = true;
    this.redraw();
  }
  /** every mark kind this map could use, given the missions its worlds
   *  play — what the palette filters its Mission group down to */
  markKindsHere(missions: readonly string[]): readonly MarkKind[] {
    return MARK_KINDS.filter((k) => k.missions.some((m) => missions.includes(m)));
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
    if (this.set.kind === "mark") {
      this.toggleMark(gx, gy);
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
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      this.endPath();
      return;
    }
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
      // A ROAD IS NOT PAINTED. Its corners are dragged and its legs are
      // clicked, so the road tool takes the click before the brush does —
      // and a road runs off the rim at both ends, so its cells are NOT
      // clamped to the board the way a brush's are
      if (this.pathClick(Math.round(p.x / CELL - 0.5), Math.round(p.y / CELL - 0.5))) return;
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
    this.pathDrag = null;
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
    if (this.pathDrag && !this.panning) {
      this.pathDragTo(Math.round(p.x / CELL - 0.5), Math.round(p.y / CELL - 0.5));
      this.hoverGx = inside ? gx : -1;
      this.hoverGy = inside ? gy : -1;
      return;
    }
    if (this.painting && !this.panning && inside) this.paintStroke(gx, gy);
    this.hoverGx = inside ? gx : -1;
    this.hoverGy = inside ? gy : -1;
  };

  private readonly onLeave = (): void => {
    this.hoverGx = -1;
    this.hoverGy = -1;
    this.panning = false;
    this.painting = false;
    this.pathDrag = null;
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
    // costs whichever rung of the campaign's one ladder the run has
    // reached (constants.ts BEACON_LADDER), so a price painted on one hill
    // would be a lie about every other — and the ladder is not a map's to
    // set, so there is nothing to draw here and no panel to draw it in.
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

    // THE MISSION MARKS, on the same terms as the beacons: a list of
    // blocks drawn over the ground rather than tiles in the batch. Each
    // wears its kind's ink, and its FIELDS are printed on it — an author
    // has to be able to read "goad, train 2" off the map without clicking
    // every square, because the whole thing they are authoring is which
    // tower is where on which wave. The selected one is ringed.
    if (this.layers.mark && this.terrain.marks.length > 0) {
      c.lineWidth = 1.5 / s;
      c.textAlign = "center";
      c.textBaseline = "middle";
      for (let i = 0; i < this.terrain.marks.length; i++) {
        const m = this.terrain.marks[i];
        const k = markKind(m.kind);
        if (!k) continue;
        if (k.geom === "path") { this.drawPathMark(c, m, k, i, s); continue; }
        const side = k.size * CELL;
        // the region a kind measures in cells, drawn as the circle it is
        // (missionMarks.ts radiusField): a garrison's ground is a number
        // on a panel and an author has to see how much board it covers
        if (k.radiusField) {
          const r = Number(m.opts?.[k.radiusField] ?? 0) * CELL;
          if (r > 0) {
            c.strokeStyle = k.color;
            c.globalAlpha = 0.5;
            c.lineWidth = 2 / s;
            c.beginPath();
            c.arc(m.x * CELL + side / 2, m.y * CELL + side / 2, r, 0, Math.PI * 2);
            c.stroke();
            c.globalAlpha = 1;
          }
        }
        // ITS OWN PORTRAIT ON A PLATE OF ITS OWN INK: the body this mark
        // will put down, carved off the atlas exactly as the HUD's
        // portraits are (markArt). The plate stays under it — it is the
        // footprint, and the ink is how the kind is told apart at a zoom
        // where the picture is eight pixels across
        c.fillStyle = k.color;
        const faceKey = markTower(m) ?? markUnit(m) ?? "";
        c.globalAlpha = this.markArt.get(faceKey) ? 0.35 : 0.75;
        c.fillRect(m.x * CELL, m.y * CELL, side, side);
        c.globalAlpha = 1;
        const face = this.markArt.get(faceKey);
        if (face) c.drawImage(face, m.x * CELL, m.y * CELL, side, side);
        c.strokeStyle = i === this.picked ? "#ffffff" : "rgba(20,4,8,0.9)";
        c.lineWidth = (i === this.picked ? 3 : 1.5) / s;
        c.strokeRect(m.x * CELL, m.y * CELL, side, side);
        // its fields, one short line each, under the block
        c.fillStyle = "#ffffff";
        c.font = `${Math.round(side / 4)}px monospace`;
        let ty = m.y * CELL + side + side / 5;
        for (const f of k.fields) {
          const v = m.opts?.[f.key];
          const txt = f.kind === "choice"
            ? (f.choices.find((ch) => ch.value === v)?.label ?? String(v)).split(" ")[0]
            : `${f.label.split(" ").pop()} ${v}`;
          c.strokeStyle = "rgba(10,10,14,0.9)";
          c.lineWidth = 4 / s;
          c.strokeText(txt, m.x * CELL + side / 2, ty);
          c.fillText(txt, m.x * CELL + side / 2, ty);
          ty += side / 4;
        }
      }
      c.lineWidth = 1.5 / s;
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
