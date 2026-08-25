import { CELL, clamp, COLS, H, ROWS, W } from "./constants";
import { Renderer } from "./renderer";
import { Sim } from "./sim";

export interface Stats {
  units: number;
  kills: number;
  leaked: number;
  simMs: number;
  fps: number;
}

/**
 * Wires the sim, the WebGL renderer, the 2d UI overlay, and input to a pair
 * of stacked canvases. Owns the requestAnimationFrame loop.
 */
export class Game {
  readonly sim = new Sim();
  private readonly renderer: Renderer;
  private readonly uictx: CanvasRenderingContext2D;

  private scale = 1;
  private hoverGx = -1;
  private hoverGy = -1;
  private invalidFlash = 0;

  private raf = 0;
  private last = 0;
  private fpsEma = 60;
  private simEma = 0;
  private destroyed = false;

  private readonly onResize = (): void => this.resize();
  private readonly onMove = (e: MouseEvent): void => {
    const p = this.canvasPos(e);
    this.hoverGx = clamp(Math.round(p.x / CELL) - 1, 0, COLS - 2);
    this.hoverGy = clamp(Math.round(p.y / CELL) - 1, 0, ROWS - 2);
  };
  private readonly onLeave = (): void => {
    this.hoverGx = -1;
    this.hoverGy = -1;
  };
  private readonly onClick = (e: MouseEvent): void => {
    const p = this.canvasPos(e);
    const gx = clamp(Math.round(p.x / CELL) - 1, 0, COLS - 2);
    const gy = clamp(Math.round(p.y / CELL) - 1, 0, ROWS - 2);
    if (this.sim.placeTower(gx, gy) !== "ok") this.invalidFlash = 0.35;
  };

  constructor(
    private readonly glCanvas: HTMLCanvasElement,
    private readonly uiCanvas: HTMLCanvasElement,
  ) {
    this.renderer = new Renderer(glCanvas);
    const ctx = uiCanvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.uictx = ctx;

    this.resize();
    this.renderer.rebuildTerrain(this.sim);

    window.addEventListener("resize", this.onResize);
    uiCanvas.addEventListener("mousemove", this.onMove);
    uiCanvas.addEventListener("mouseleave", this.onLeave);
    uiCanvas.addEventListener("click", this.onClick);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.uiCanvas.removeEventListener("mousemove", this.onMove);
    this.uiCanvas.removeEventListener("mouseleave", this.onLeave);
    this.uiCanvas.removeEventListener("click", this.onClick);
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
    };
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

  private canvasPos(e: MouseEvent): { x: number; y: number } {
    const r = this.uiCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height),
    };
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000) || 0.016;
    this.last = now;

    const t0 = performance.now();
    this.sim.update(dt);
    if (this.invalidFlash > 0) this.invalidFlash -= dt;
    const simMs = performance.now() - t0;

    this.renderer.render(this.sim);
    this.drawOverlay();

    this.fpsEma += (1 / Math.max(dt, 1e-4) - this.fpsEma) * 0.05;
    this.simEma += (simMs - this.simEma) * 0.1;
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawOverlay(): void {
    const c = this.uictx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.clearRect(0, 0, W, H);
    if (this.hoverGx >= 0) {
      const ok = this.sim.canPlace(this.hoverGx, this.hoverGy);
      const x = this.hoverGx * CELL, y = this.hoverGy * CELL;
      c.strokeStyle = ok ? "rgba(91,217,232,0.8)" : "rgba(255,90,90,0.8)";
      c.setLineDash([4, 3]);
      c.lineWidth = 1.5;
      c.strokeRect(x + 1, y + 1, CELL * 2 - 2, CELL * 2 - 2);
      c.setLineDash([]);
    }
    if (this.invalidFlash > 0) {
      c.fillStyle = `rgba(255,90,90,${this.invalidFlash * 0.25})`;
      c.fillRect(0, 0, W, H);
    }
  }
}
