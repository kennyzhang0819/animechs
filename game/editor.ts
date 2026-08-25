import { buildAtlas } from "./atlas";
import { CELL, clamp, COLS, H, ROWS, W } from "./constants";
import { PALETTE, terrainFromMap, mapFromTerrain, type MapData, type PaletteSet } from "./maps";
import { Renderer } from "./renderer";
import { WALL_PINE, type Prop, type Terrain } from "./terrain";

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
  pines: Prop[];
  decor: Prop[];
}

const quarterTurn = (): number => ((Math.random() * 4) | 0) * (Math.PI / 2);

/**
 * The map editor: same full-screen canvas pair and camera as the game, but
 * the left button paints terrain instead of building towers. Debug tool —
 * it never runs a Sim; it renders the terrain batch and edits it in place.
 */
export class MapEditor {
  terrain: Terrain;
  private readonly renderer: Renderer;
  private readonly uictx: CanvasRenderingContext2D;

  // active tool
  private set: PaletteSet = PALETTE[0];
  private variant = 0; // index into set.variants, used when randomize is off
  randomize = true;
  brush = 1; // painted square is (2*brush - 1) cells wide
  dirty = false;

  private readonly undoStack: Snapshot[] = [];

  // camera — identical model to Game: cover-scale, zoom in [1,6]
  private scale = 1;
  private zoom = 1;
  private tlx = 0;
  private tly = 0;
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
    this.terrain = terrainFromMap(map);
    this.renderer = new Renderer(glCanvas, atlas);
    const ctx = uiCanvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.uictx = ctx;

    this.resize();
    // open on the whole map — fit view, like the game
    this.zoom = this.minZoom();
    this.clampCamera();
    this.renderer.rebuildTerrain(this);

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
    return mapFromTerrain(this.terrain, this.map.id, this.map.name);
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.terrain.floor.set(s.floor);
    this.terrain.wall.set(s.wall);
    this.terrain.blocked.set(s.blocked);
    this.terrain.pines = s.pines;
    this.terrain.decor = s.decor;
    this.dirty = true;
    this.renderer.rebuildTerrain(this);
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
      pines: this.terrain.pines.map((p) => ({ ...p })),
      decor: this.terrain.decor.map((p) => ({ ...p })),
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
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return;
    const T = this.terrain;
    const i = gy * COLS + gx;
    const set = this.set;
    const pick = this.randomize
      ? set.variants[(Math.random() * set.variants.length) | 0]
      : set.variants[this.variant];
    const rot = this.randomize ? quarterTurn() : 0;
    const cx = (gx + 0.5) * CELL, cy = (gy + 0.5) * CELL;

    if (set.kind === "floor") {
      T.floor[i] = pick;
      T.blocked[i] = 0;
      T.wall[i] = 0;
      this.removePropsAt(gx, gy);
    } else if (set.kind === "wall") {
      T.blocked[i] = 1;
      T.wall[i] = pick;
      this.removePropsAt(gx, gy);
    } else if (set.kind === "pine") {
      T.blocked[i] = 1;
      T.wall[i] = WALL_PINE;
      this.removePropsAt(gx, gy);
      T.pines.push({ x: cx, y: cy, size: CELL * 1.5, rot, kind: 0 });
    } else if (set.kind === "decor") {
      if (T.blocked[i]) return; // props live on open ground, like the generator's
      this.removePropsAt(gx, gy);
      T.decor.push({
        x: cx,
        y: cy,
        size: pick === 2 ? CELL : CELL * 1.5, // shrubs are 32px art, boulders 48px
        rot,
        kind: pick,
      });
    } else {
      // erase: strip walls and props, keep the floor
      T.blocked[i] = 0;
      T.wall[i] = 0;
      this.removePropsAt(gx, gy);
    }
    this.dirty = true;
  }

  private paintAt(gx: number, gy: number): void {
    const r = this.brush - 1;
    for (let y = gy - r; y <= gy + r; y++)
      for (let x = gx - r; x <= gx + r; x++) this.paintCell(x, y);
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
    this.renderer.rebuildTerrain(this);
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
      this.zoom = clamp(this.zoom * Math.exp(-dy * (pinch ? 0.012 : 0.0015)), this.minZoom(), ZOOM_MAX);
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
    const gx = clamp((p.x / CELL) | 0, 0, COLS - 1);
    const gy = clamp((p.y / CELL) | 0, 0, ROWS - 1);
    if (this.painting && !this.panning) this.paintStroke(gx, gy);
    this.hoverGx = gx;
    this.hoverGy = gy;
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

  /** zoom that fits the whole world in view — letterboxed on the spare axis */
  private minZoom(): number {
    return Math.min(this.uiCanvas.width / W, this.uiCanvas.height / H) / this.scale;
  }

  private clampCamera(): void {
    const vw = this.visW(), vh = this.visH();
    this.tlx = vw >= W ? (W - vw) / 2 : clamp(this.tlx, 0, W - vw);
    this.tly = vh >= H ? (H - vh) / 2 : clamp(this.tly, 0, H - vh);
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round((this.glCanvas.clientWidth || W) * dpr);
    const bh = Math.round((this.glCanvas.clientHeight || H) * dpr);
    if (bw === this.glCanvas.width && bh === this.glCanvas.height) return;
    this.glCanvas.width = bw;
    this.glCanvas.height = bh;
    this.uiCanvas.width = bw;
    this.uiCanvas.height = bh;
    this.scale = Math.max(bw / W, bh / H);
    this.zoom = clamp(this.zoom, this.minZoom(), ZOOM_MAX);
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
    if (this.hoverGx < 0) return;
    const s = this.scale * this.zoom;
    c.setTransform(s, 0, 0, s, -this.tlx * s, -this.tly * s);
    const r = this.brush - 1;
    const x = (this.hoverGx - r) * CELL, y = (this.hoverGy - r) * CELL;
    const side = (2 * r + 1) * CELL;
    c.fillStyle = this.set.kind === "erase" ? "rgba(255,90,90,0.18)" : "rgba(91,217,232,0.14)";
    c.fillRect(x, y, side, side);
    c.strokeStyle = this.set.kind === "erase" ? "rgba(255,90,90,0.9)" : "rgba(91,217,232,0.85)";
    c.lineWidth = 1.5 / s;
    c.strokeRect(x, y, side, side);
  }
}
