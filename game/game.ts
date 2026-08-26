import { buildAtlas } from "./atlas";
import { loadOfficialMaps } from "./maps";
import { CELL, clamp, COLS, H, ROWS, TOWERS, W } from "./constants";
import type { LevelSpec, TowerKind } from "./levels";
import { scrapForKills } from "./progress";
import { Renderer } from "./renderer";
import { Sim } from "./sim";
import type { TechState } from "./tech";
import type { Tower } from "./types";

export interface UiState {
  levelId: string;
  remaining: number;
  /** how many of each kind are on the field right now, like UNIT_KINDS */
  byKind: number[];
  /** seconds until the next wave, or 0 while one is already coming in */
  nextWaveIn: number;
  /** 1-based wave now on the field, out of how many the level holds */
  currentWave: number;
  totalWaves: number;
  buildKind: TowerKind | null;
  paused: boolean;
  /** the core is destroyed — the field is frozen behind the score screen */
  lost: boolean;
  /** every enemy in the script is down — the success screen takes over */
  won: boolean;
  kills: number;
  /** the esc game menu is up: sim held, resume or abandon from the overlay */
  menuOpen: boolean;
  /** scrap this run's kills are worth so far, before bonuses/economy */
  scrapEarned: number;
  /** live towers per kind, for the menu's "2/6" cap badges */
  counts: Record<TowerKind, number>;
  /** campaign restrictions from the tech tree; null = unrestricted (editor) */
  caps: Record<TowerKind, number> | null;
  unlocked: readonly TowerKind[] | null;
}

export interface Stats {
  units: number;
  kills: number;
  leaked: number;
  simMs: number;
  fps: number;
  zoom: number;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 2;
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

  // device px per world px at zoom 1 — the "cover" scale, so the canvas is
  // always filled and the world is cropped on the axis that overflows
  private scale = 1;
  private hoverGx = -1;
  private hoverGy = -1;

  // camera: zoom 1 fills the viewport; (tlx, tly) is the visible top-left in world px
  private zoom = 1;
  private tlx = 0;
  private tly = 0;
  private panning = false;
  private panMoved = 0;
  // cursor mode: null is the normal cursor (click a tower to inspect its
  // range); a kind from the tower menu turns on the ghost + paint placement
  private buildKind: TowerKind | null = null;
  private selected: Tower | null = null;
  private building = false;
  private buildFrom = { x: 0, y: 0 };
  // world point of a right-button press; a release that never really moved
  // is a click, and clicks on a tower sell it (dragging pans instead)
  private sellPress: { x: number; y: number } | null = null;
  private lastMouse = { x: 0, y: 0 };
  private readonly keysDown = new Set<string>();
  private paused = false;
  private menuOpen = false;
  // the campaign's tower unlocks and caps (see setTech); null in the editor
  private tech: TechState | null = null;

  private raf = 0;
  private last = 0;
  private fpsEma = 60;
  private simEma = 0;
  private destroyed = false;

  private readonly onResize = (): void => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Escape") {
      // esc backs out one layer at a time: an open menu closes, an active
      // build/selection cancels, and only a bare esc brings up the game
      // menu. The end screens own the UI — no menu underneath them
      if (this.menuOpen) {
        this.menuOpen = false;
        return;
      }
      if (this.buildKind || this.selected || this.building) {
        this.buildKind = null;
        this.selected = null;
        this.building = false;
        return;
      }
      if (!this.sim.lost() && !this.won()) this.menuOpen = true;
      return;
    }
    if (e.code === "Space" && !e.repeat) {
      if (this.menuOpen) return; // the menu already holds the sim
      // space ALWAYS pauses — even with a UI button focused after a click,
      // where the browser would otherwise re-activate the button. Only real
      // text entry keeps its space (none exists in the UI today)
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      this.paused = !this.paused;
      return;
    }
    if (!PAN_KEYS[e.code]) return;
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
    const r = this.uiCanvas.getBoundingClientRect();
    // mac trackpad pinches arrive as ctrl+wheel; real mouse wheels tick in
    // coarse integer notches (or line-mode deltas). Everything else is
    // two-finger trackpad scroll, which pans the camera instead of zooming.
    const pinch = e.ctrlKey;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // lines -> px
    const notchy =
      e.deltaMode !== 0 ||
      (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40);
    if (pinch || notchy) {
      const before = this.mouseWorld(e);
      this.zoom = clamp(this.zoom * Math.exp(-dy * (pinch ? 0.012 : 0.0015)), ZOOM_MIN, ZOOM_MAX);
      // keep the world point under the cursor fixed
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
      if (this.buildKind) {
        // left press places right away, and dragging chains from here;
        // the ghost already shows red where placement fails
        this.building = true;
        this.buildFrom = p;
        const sz = TOWERS[this.buildKind].size;
        this.sim.placeTower(
          clamp(Math.round(p.x / CELL - sz / 2), 0, COLS - sz),
          clamp(Math.round(p.y / CELL - sz / 2), 0, ROWS - sz),
          this.buildKind,
        );
      } else {
        // normal cursor: clicking a tower shows its range, empty ground clears
        this.selected = this.sim.towerAt(p.x, p.y);
      }
    } else if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.building = false;
      this.panning = true;
      this.panMoved = 0;
      this.sellPress = e.button === 2 ? this.mouseWorld(e) : null;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };
  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2 && this.sellPress && this.panMoved < 6) {
      // right-click cancels build mode; with the normal cursor it demolishes
      if (this.buildKind) this.buildKind = null;
      else this.sim.sellTowerAt(this.sellPress.x, this.sellPress.y);
    }
    this.sellPress = null;
    this.panning = false;
    this.building = false;
  };
  private readonly onMove = (e: MouseEvent): void => {
    if (this.panning) {
      const r = this.uiCanvas.getBoundingClientRect();
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.panMoved += Math.abs(dx) + Math.abs(dy);
      this.tlx -= (dx / r.width) * this.visW();
      this.tly -= (dy / r.height) * this.visH();
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.clampCamera();
    }
    const p = this.mouseWorld(e);
    if (this.building && this.buildKind && !this.panning) {
      this.sim.placeLine(this.buildFrom.x, this.buildFrom.y, p.x, p.y, this.buildKind);
      this.buildFrom = p;
    }
    const hsz = this.buildKind ? TOWERS[this.buildKind].size : 2;
    this.hoverGx = clamp(Math.round(p.x / CELL - hsz / 2), 0, COLS - hsz);
    this.hoverGy = clamp(Math.round(p.y / CELL - hsz / 2), 0, ROWS - hsz);
  };
  private readonly onLeave = (): void => {
    this.hoverGx = -1;
    this.hoverGy = -1;
    this.panning = false;
    this.building = false;
    this.sellPress = null;
  };
  private readonly onContext = (e: Event): void => e.preventDefault();
  // trackpad pinch = ctrl+wheel: the canvas handler already consumes it, but
  // a pinch that starts over a UI overlay (HUD, tower menu) would reach the
  // browser and zoom the PAGE — which sticks per-site and shoves the UI
  // off-screen. Swallow it window-wide while the game screen is up
  private readonly onWinWheel = (e: WheelEvent): void => {
    if (e.ctrlKey) e.preventDefault();
  };

  /** loads the sprite atlas, then wires everything up */
  static async create(glCanvas: HTMLCanvasElement, uiCanvas: HTMLCanvasElement): Promise<Game> {
    // the sim reads the official map documents, which live outside the
    // module graph and are fetched, never imported (imported JSON turned
    // every editor save into a Turbopack HMR update it cannot apply)
    const [atlas] = await Promise.all([buildAtlas(), loadOfficialMaps()]);
    return new Game(glCanvas, uiCanvas, atlas);
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

  setBuildKind(kind: TowerKind | null): void {
    if (kind && this.tech && !this.tech.unlocked.has(kind)) return;
    this.buildKind = kind;
    if (kind) this.selected = null;
  }

  /** apply the save's tower unlocks and caps; null lifts them (editor, dev) */
  setTech(tech: TechState | null): void {
    this.tech = tech;
    this.sim.setTech(tech);
  }

  /** HUD skip button: start the next wave without waiting out the timer */
  skipWave(): void {
    this.sim.skipWave();
  }

  /** the whole script is dealt with and the core stands */
  private won(): boolean {
    return !this.sim.lost() && this.sim.remaining() <= 0;
  }

  /** the esc menu's Resume button */
  closeMenu(): void {
    this.menuOpen = false;
  }

  /** everything the React overlay renders, polled a few times a second */
  ui(): UiState {
    return {
      levelId: this.sim.level.id,
      remaining: this.sim.remaining(),
      byKind: this.sim.aliveByKindList(),
      nextWaveIn: this.sim.nextWaveIn(),
      currentWave: this.sim.currentWave(),
      totalWaves: this.sim.totalWaves,
      buildKind: this.buildKind,
      paused: this.paused,
      lost: this.sim.lost(),
      won: this.won(),
      kills: this.sim.kills,
      menuOpen: this.menuOpen,
      scrapEarned: scrapForKills(this.sim.killsByKind),
      counts: this.sim.towerCounts(),
      caps: this.tech ? this.tech.caps : null,
      unlocked: this.tech ? Array.from(this.tech.unlocked) : null,
    };
  }

  reset(): void {
    this.sim.reset();
    this.menuOpen = false;
    this.renderer.rebuildTerrain(this.sim);
  }

  /** switch to (or restart) a level: fresh sim state, terrain rebuilt */
  loadLevel(spec: LevelSpec): void {
    this.sim.loadLevel(spec);
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

  /** visible world width/height in world px, given the cover scale and zoom */
  private visW(): number {
    return this.uiCanvas.width / (this.scale * this.zoom);
  }

  private visH(): number {
    return this.uiCanvas.height / (this.scale * this.zoom);
  }

  private clampCamera(): void {
    this.tlx = clamp(this.tlx, 0, W - this.visW());
    this.tly = clamp(this.tly, 0, H - this.visH());
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round((this.glCanvas.clientWidth || W) * dpr);
    const bh = Math.round((this.glCanvas.clientHeight || H) * dpr);
    // only skip the canvas attribute writes (they clear the canvas) — the
    // scale must ALWAYS be recomputed: a hot-reload recreates Game on the
    // same canvas element with matching backing size, and an early return
    // here left this.scale at its placeholder 1, rendering the world at
    // raw device pixels (cropped right, dead band below) until a full
    // page reload. That was the "zoom is fundamentally broken" bug.
    if (bw !== this.glCanvas.width || bh !== this.glCanvas.height) {
      this.glCanvas.width = bw;
      this.glCanvas.height = bh;
      this.uiCanvas.width = bw;
      this.uiCanvas.height = bh;
    }
    this.scale = Math.max(bw / W, bh / H);
    this.clampCamera();
  }

  /** mouse event -> world coordinates through the camera */
  private mouseWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.uiCanvas.getBoundingClientRect();
    return {
      x: this.tlx + ((e.clientX - r.left) / r.width) * this.visW(),
      y: this.tly + ((e.clientY - r.top) / r.height) * this.visH(),
    };
  }

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = clamp((now - this.last) / 1000, 0, 0.05) || 0.016;
    this.last = now;

    // keyboard pan: half a viewport per second
    for (const code of this.keysDown) {
      const dir = PAN_KEYS[code];
      this.tlx += dir[0] * this.visW() * 0.5 * dt;
      this.tly += dir[1] * this.visH() * 0.5 * dt;
    }
    if (this.keysDown.size > 0) this.clampCamera();

    const t0 = performance.now();
    // a lost game freezes mid-carnage: the score screen sits over the
    // exact frame the core fell on, until retry resets the sim. The esc
    // menu holds the sim the same way. A won game keeps running — the
    // field is empty and the last death effects get to play out
    if (!this.paused && !this.menuOpen && !this.sim.lost()) this.sim.update(dt);
    const simMs = performance.now() - t0;

    this.renderer.render(
      this.sim,
      this.zoom,
      -this.tlx * this.zoom,
      -this.tly * this.zoom,
      this.scale,
    );
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

    // selection: range ring + footprint outline (drops when the tower is sold)
    if (this.selected && !this.sim.towers.includes(this.selected)) this.selected = null;
    if (this.selected) {
      const t = this.selected;
      c.beginPath();
      c.arc(t.x, t.y, TOWERS[t.kind].range, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,211,127,0.06)";
      c.fill();
      c.strokeStyle = "rgba(255,211,127,0.7)";
      c.lineWidth = 1.5;
      c.stroke();
      const selPx = TOWERS[t.kind].size * CELL;
      c.strokeRect(t.gx * CELL + 1, t.gy * CELL + 1, selPx - 2, selPx - 2);
    }

    if (this.buildKind && this.hoverGx >= 0 && !this.panning) {
      // red marks anything that blocks the spot: walls, the core, units
      // underneath, or a placement that would seal the swarm's last route
      const sz = TOWERS[this.buildKind].size;
      const px = sz * CELL;
      const ok = this.sim.canPlace(this.hoverGx, this.hoverGy, this.buildKind);
      const x = this.hoverGx * CELL, y = this.hoverGy * CELL;
      c.fillStyle = ok ? "rgba(255,211,127,0.14)" : "rgba(255,90,90,0.3)";
      c.fillRect(x, y, px, px);
      c.strokeStyle = ok ? "rgba(255,211,127,0.85)" : "rgba(255,90,90,0.9)";
      c.lineWidth = 1.5;
      c.strokeRect(x + 1, y + 1, px - 2, px - 2);
      // interior lines so the ghost reads as the cells it occupies
      c.lineWidth = 1;
      c.globalAlpha = 0.45;
      c.beginPath();
      for (let i = 1; i < sz; i++) {
        c.moveTo(x + CELL * i, y + 1);
        c.lineTo(x + CELL * i, y + px - 1);
        c.moveTo(x + 1, y + CELL * i);
        c.lineTo(x + px - 1, y + CELL * i);
      }
      c.stroke();
      c.globalAlpha = 1;
    }
  }
}
