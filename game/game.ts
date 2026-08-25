import { buildAtlas } from "./atlas";
import { CELL, clamp, COLS, H, ROWS, W } from "./constants";
import { Renderer } from "./renderer";
import { Sim } from "./sim";

export interface Stats {
  units: number;
  kills: number;
  leaked: number;
  simMs: number;
  fps: number;
  zoom: number;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
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

/**
 * Wires the sim, the WebGL renderer, the 2d UI overlay, camera, and input to
 * a pair of stacked canvases. Owns the requestAnimationFrame loop.
 */
export class Game {
  readonly sim = new Sim();
  private readonly renderer: Renderer;
  private readonly uictx: CanvasRenderingContext2D;

  private scale = 1;
  private hoverGx = -1;
  private hoverGy = -1;
  private invalidFlash = 0;

  // camera: zoom 1 fits the whole map; (tlx, tly) is the visible top-left in world px
  private zoom = 1;
  private tlx = 0;
  private tly = 0;
  private panning = false;
  private panMoved = 0;
  private lastMouse = { x: 0, y: 0 };
  private readonly keysDown = new Set<string>();

  private raf = 0;
  private last = 0;
  private fpsEma = 60;
  private simEma = 0;
  private destroyed = false;

  private readonly onResize = (): void => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!PAN_KEYS[e.code] || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault(); // arrows would scroll the page
    this.keysDown.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
  };
  // missed keyups (cmd+tab away mid-pan) would leave the camera drifting
  private readonly onBlur = (): void => this.keysDown.clear();
  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const before = this.mouseWorld(e);
    const r = this.uiCanvas.getBoundingClientRect();
    this.zoom = clamp(this.zoom * Math.exp(-e.deltaY * 0.0015), ZOOM_MIN, ZOOM_MAX);
    // keep the world point under the cursor fixed
    this.tlx = before.x - ((e.clientX - r.left) / r.width) * (W / this.zoom);
    this.tly = before.y - ((e.clientY - r.top) / r.height) * (H / this.zoom);
    this.clampCamera();
  };
  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.panning = true;
      this.panMoved = 0;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };
  private readonly onMouseUp = (): void => {
    this.panning = false;
  };
  private readonly onMove = (e: MouseEvent): void => {
    if (this.panning) {
      const r = this.uiCanvas.getBoundingClientRect();
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.panMoved += Math.abs(dx) + Math.abs(dy);
      this.tlx -= (dx / r.width) * (W / this.zoom);
      this.tly -= (dy / r.height) * (H / this.zoom);
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.clampCamera();
    }
    const p = this.mouseWorld(e);
    this.hoverGx = clamp(Math.round(p.x / CELL) - 1, 0, COLS - 2);
    this.hoverGy = clamp(Math.round(p.y / CELL) - 1, 0, ROWS - 2);
  };
  private readonly onLeave = (): void => {
    this.hoverGx = -1;
    this.hoverGy = -1;
    this.panning = false;
  };
  private readonly onClick = (e: MouseEvent): void => {
    const p = this.mouseWorld(e);
    const gx = clamp(Math.round(p.x / CELL) - 1, 0, COLS - 2);
    const gy = clamp(Math.round(p.y / CELL) - 1, 0, ROWS - 2);
    if (this.sim.placeTower(gx, gy) !== "ok") this.invalidFlash = 0.35;
  };
  private readonly onContext = (e: Event): void => e.preventDefault();

  /** loads the sprite atlas, then wires everything up */
  static async create(glCanvas: HTMLCanvasElement, uiCanvas: HTMLCanvasElement): Promise<Game> {
    return new Game(glCanvas, uiCanvas, await buildAtlas());
  }

  private constructor(
    private readonly glCanvas: HTMLCanvasElement,
    private readonly uiCanvas: HTMLCanvasElement,
    atlas: HTMLCanvasElement,
  ) {
    this.renderer = new Renderer(glCanvas, atlas);
    const ctx = uiCanvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.uictx = ctx;

    this.resize();
    this.renderer.rebuildTerrain(this.sim);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("mouseup", this.onMouseUp);
    uiCanvas.addEventListener("wheel", this.onWheel, { passive: false });
    uiCanvas.addEventListener("mousedown", this.onMouseDown);
    uiCanvas.addEventListener("mousemove", this.onMove);
    uiCanvas.addEventListener("mouseleave", this.onLeave);
    uiCanvas.addEventListener("click", this.onClick);
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
    this.uiCanvas.removeEventListener("wheel", this.onWheel);
    this.uiCanvas.removeEventListener("mousedown", this.onMouseDown);
    this.uiCanvas.removeEventListener("mousemove", this.onMove);
    this.uiCanvas.removeEventListener("mouseleave", this.onLeave);
    this.uiCanvas.removeEventListener("click", this.onClick);
    this.uiCanvas.removeEventListener("contextmenu", this.onContext);
  }

  setTarget(n: number): void {
    this.sim.target = n;
  }

  reset(): void {
    this.sim.reset();
    this.renderer.rebuildTerrain(this.sim);
  }

  stats(): Stats {
    return {
      units: this.sim.n,
      kills: this.sim.kills,
      leaked: this.sim.leaked,
      simMs: this.simEma,
      fps: Math.round(this.fpsEma),
      zoom: this.zoom,
    };
  }

  private clampCamera(): void {
    this.tlx = clamp(this.tlx, 0, W - W / this.zoom);
    this.tly = clamp(this.tly, 0, H - H / this.zoom);
  }

  private resize(): void {
    const cssW = this.glCanvas.clientWidth || W;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round(cssW * dpr);
    if (bw === this.glCanvas.width) return;
    this.glCanvas.width = bw;
    this.glCanvas.height = Math.round((bw * H) / W);
    this.uiCanvas.width = bw;
    this.uiCanvas.height = this.glCanvas.height;
    this.scale = bw / W;
  }

  /** mouse event -> world coordinates through the camera */
  private mouseWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.uiCanvas.getBoundingClientRect();
    return {
      x: this.tlx + ((e.clientX - r.left) / r.width) * (W / this.zoom),
      y: this.tly + ((e.clientY - r.top) / r.height) * (H / this.zoom),
    };
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05) || 0.016;
    this.last = now;

    // keyboard pan: half a viewport per second
    for (const code of this.keysDown) {
      const dir = PAN_KEYS[code];
      this.tlx += dir[0] * (W / this.zoom) * 0.5 * dt;
      this.tly += dir[1] * (H / this.zoom) * 0.5 * dt;
    }
    if (this.keysDown.size > 0) this.clampCamera();

    const t0 = performance.now();
    this.sim.update(dt);
    if (this.invalidFlash > 0) this.invalidFlash -= dt;
    const simMs = performance.now() - t0;

    this.renderer.render(this.sim, this.zoom, -this.tlx * this.zoom, -this.tly * this.zoom);
    this.drawOverlay();

    this.fpsEma += (1 / Math.max(dt, 1e-4) - this.fpsEma) * 0.05;
    this.simEma += (simMs - this.simEma) * 0.1;
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawOverlay(): void {
    const c = this.uictx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    // world-space transform through the camera
    const s = this.scale * this.zoom;
    c.setTransform(s, 0, 0, s, -this.tlx * s, -this.tly * s);
    if (this.hoverGx >= 0 && !this.panning) {
      const ok = this.sim.canPlace(this.hoverGx, this.hoverGy);
      const x = this.hoverGx * CELL, y = this.hoverGy * CELL;
      c.strokeStyle = ok ? "rgba(91,217,232,0.8)" : "rgba(255,90,90,0.8)";
      c.setLineDash([4, 3]);
      c.lineWidth = 1.5;
      c.strokeRect(x + 1, y + 1, CELL * 2 - 2, CELL * 2 - 2);
      c.setLineDash([]);
    }
    if (this.invalidFlash > 0) {
      c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      c.fillStyle = `rgba(255,90,90,${this.invalidFlash * 0.25})`;
      c.fillRect(0, 0, W, H);
    }
  }
}
