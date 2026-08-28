import { atlasReady, buildAtlas } from "./atlas";
import {
  loadOfficialMaps,
  OFFICIAL_MAP_IDS,
  OFFICIAL_MAPS,
  refreshMap,
  SPAWN_REGIONS,
} from "./maps";
import { CELL, clamp, COLS, H, ROWS, TOWERS, W } from "./constants";
import { loadLevelDocs, type LevelSpec, type TowerKind } from "./levels";
import type { Cost } from "./items";
import { dropsForKills, type TowerPlacement } from "./progress";
import { Renderer } from "./renderer";
import { Sim } from "./sim";
import type { TechState } from "./tech";
import type { Tower } from "./types";

export interface UiState {
  levelId: string;
  /** which tier of the ladder is being played (see ladder.ts) */
  tier: number;
  /** enemy level this tier carries — every unit's health x 1.06^level */
  enemyLevel: number;
  remaining: number;
  /** how many of each kind are on the field right now, like UNIT_KINDS */
  byKind: number[];
  /** seconds until the next wave, or 0 while one is already coming in */
  nextWaveIn: number;
  /** 1-based wave now on the field, out of how many the level holds */
  currentWave: number;
  totalWaves: number;
  /** the wave a "skip to wave" rush is spawning toward, or 0 when idle */
  buildKind: TowerKind | null;
  paused: boolean;
  /** the core is destroyed — the field is frozen behind the score screen */
  lost: boolean;
  /** every enemy in the script is down — the success screen takes over */
  won: boolean;
  kills: number;
  /** the esc game menu is up: sim held, resume or abandon from the overlay */
  menuOpen: boolean;
  /** simulation speed multiplier: one of SPEEDS */
  speed: number;
  /** is the drop-zone and air-route overlay on? */
  showRoutes: boolean;
  /** what this run's kills have banked so far, by currency (see items.ts) */
  earned: Cost;
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

/** the speeds the HUD toggle offers */
export const SPEEDS: readonly number[] = [1, 2, 4, 8, 16];

/**
 * The stages of starting a level, in order, as the loading screen reports
 * them. They are stages rather than a byte count on purpose: none of this
 * work streams, so a percentage would be invented. The bar advances a step
 * at a time and each step is honest about what is happening.
 */
export const LOAD_STEPS = ["sprites", "map", "world", "warmup"] as const;
export type LoadStep = (typeof LOAD_STEPS)[number];

export const LOAD_STEP_LABEL: Record<LoadStep, string> = {
  sprites: "Packing sprites",
  map: "Reading the map",
  world: "Carving terrain",
  warmup: "Warming up",
};

/**
 * Which step a cold start really begins at. Packing the sheet is the only
 * genuinely slow stage, and it happens once per page — so after the first
 * level the bar would sit at "Packing sprites" for a millisecond and then
 * leap, which reads as a stutter. Starting the bar past the finished work
 * instead makes a warm start look like what it is: nearly instant.
 */
export function firstLoadStep(): LoadStep {
  return atlasReady() ? "map" : "sprites";
}

/**
 * Give the browser a chance to actually paint before the next stage starts.
 *
 * Announcing a step is not the same as showing it: packing the sheet is one
 * unbroken ~200ms task, so without a yield here the loading screen would be
 * told about a step and then have the main thread taken away before it could
 * draw it — the label the player reads would always be one behind the work.
 * Two frames, because the first only lets React commit and the second is
 * where the commit reaches the screen.
 *
 * The escapes matter. requestAnimationFrame never fires in a hidden tab, so
 * a level started in a background tab would wait forever on a paint that
 * cannot happen — hence the up-front hidden check and the timeout behind it
 * for a tab that goes hidden mid-wait.
 */
function paint(): Promise<void> {
  if (document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(bail);
      resolve();
    };
    const bail = setTimeout(done, 250);
    requestAnimationFrame(() => requestAnimationFrame(done));
  });
}

// zoom 1 is "cover": the world fills the viewport completely, cropped on
// whichever axis overflows. It is also the FLOOR — zooming out past cover
// would letterbox the world against empty space, and the screen must never
// show anything but map. A map taller than the viewport is panned, not
// shrunk to fit
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
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
  readonly sim: Sim;
  private readonly renderer: Renderer;
  private readonly uictx: CanvasRenderingContext2D;

  // device px per world px at zoom 1 — the "cover" scale, so the canvas is
  // always filled and the world is cropped on the axis that overflows
  private scale = 1;
  // the playable height in world px: the loaded map's own rows, so a map
  // stored on a shorter grid neither letterboxes nor pans into its padding
  private worldH = H;
  private worldW = W;
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
  // right button = demolish, the exact mirror of the left button's build
  // chain: the press pulls down whatever is under it and the drag keeps
  // pulling down everything it crosses. Panning therefore lives on the
  // MIDDLE drag and on WASD/arrows (see PAN_KEYS), not here
  private selling = false;
  private sellFrom = { x: 0, y: 0 };
  private lastMouse = { x: 0, y: 0 };
  private readonly keysDown = new Set<string>();
  private paused = false;
  /**
   * The route overlay: drop zones, and the lines flyers fly out of them.
   * OFF by default — it is an answer to "where is that coming from", not
   * something to leave on top of the field all game.
   */
  private showRoutes = false;
  private menuOpen = false;
  // fast-forward: the sim runs this many fixed steps per rendered frame, so
  // a sped-up run steps exactly like a real-time one (stretching dt instead
  // would let units tunnel through walls and each other)
  private speed = 1;
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
    if (r.width <= 0 || r.height <= 0) return; // zero-sized: nothing to aim at
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
    } else if (e.button === 2) {
      e.preventDefault();
      this.building = false;
      // right-click still escapes build mode first — you reach for it to put
      // the ghost away, and that press must never also demolish something
      if (this.buildKind) {
        this.buildKind = null;
        return;
      }
      // otherwise it demolishes on press and chains from here, exactly like
      // the left button builds on press and chains from there
      const p = this.mouseWorld(e);
      this.selling = true;
      this.sellFrom = p;
      this.sim.sellTowerAt(p.x, p.y);
      this.dropSelectionIfGone();
    } else if (e.button === 1) {
      e.preventDefault();
      this.building = false;
      this.panning = true;
      this.panMoved = 0;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };
  private readonly onMouseUp = (): void => {
    this.selling = false;
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
    if (this.selling && !this.panning) {
      this.sim.sellLine(this.sellFrom.x, this.sellFrom.y, p.x, p.y);
      this.sellFrom = p;
      this.dropSelectionIfGone();
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
    this.selling = false;
  };
  /**
   * The range ring reads `selected`, which holds a Tower by reference — a
   * demolished tower would keep drawing its ring over bare rock. Drop the
   * selection the moment it leaves the sim.
   */
  private dropSelectionIfGone(): void {
    if (this.selected && !this.sim.towers.includes(this.selected)) this.selected = null;
  }
  private readonly onContext = (e: Event): void => e.preventDefault();
  // trackpad pinch = ctrl+wheel: the canvas handler already consumes it, but
  // a pinch that starts over a UI overlay (HUD, tower menu) would reach the
  // browser and zoom the PAGE — which sticks per-site and shoves the UI
  // off-screen. Swallow it window-wide while the game screen is up
  private readonly onWinWheel = (e: WheelEvent): void => {
    if (e.ctrlKey) e.preventDefault();
  };

  /**
   * Everything a level needs before its first frame, in the order it
   * happens. The loading screen names these; see LOAD_STEP_LABEL.
   */
  static async create(
    glCanvas: HTMLCanvasElement,
    uiCanvas: HTMLCanvasElement,
    spec: LevelSpec,
    onStep: (step: LoadStep) => void = () => {},
  ): Promise<Game> {
    // announce, then let the screen draw it, THEN do the work
    const begin = async (step: LoadStep): Promise<void> => {
      onStep(step);
      await paint();
    };

    // packed once per page and shared from then on: the long step on a cold
    // start, free on every level after. A warm start does not announce it at
    // all, matching firstLoadStep — otherwise the bar would step BACKWARDS
    // from where the screen came up
    if (!atlasReady()) await begin("sprites");
    const atlas = await buildAtlas();

    // the sim reads the official map documents, which live outside the
    // module graph and are fetched, never imported (imported JSON turned
    // every editor save into a Turbopack HMR update it cannot apply).
    // Only the document about to be played is re-read: the editor returns
    // through a client-side route, so a saved map must not be played from
    // the stale copy in memory — but that is true of ONE map, not five
    // The level SCRIPT is re-read here too, for the same reason. Both
    // editors return through a client-side route, so an edited wave script
    // is as capable of being stale as an edited map — and applyLevelDoc
    // overlays onto the WORLDS entry in place, which is the object this
    // spec already points at, so the sim built below picks it up
    await begin("map");
    const mapId = spec.map ?? OFFICIAL_MAP_IDS[0];
    await Promise.all([
      OFFICIAL_MAPS.length === 0 ? loadOfficialMaps() : refreshMap(mapId),
      loadLevelDocs(),
    ]);

    // terrain, flow field and the static geometry batches
    await begin("world");
    const game = new Game(glCanvas, uiCanvas, atlas, spec);

    // one full frame on the GPU before anything uncovers the canvas, so
    // the reveal shows the map rather than a black flash that resolves a
    // frame later
    await begin("warmup");
    game.warmup();
    return game;
  }

  private constructor(
    private readonly glCanvas: HTMLCanvasElement,
    private readonly uiCanvas: HTMLCanvasElement,
    atlas: HTMLCanvasElement,
    level: LevelSpec,
  ) {
    // the level is built ONCE, here. Constructing a default sim and then
    // calling loadLevel meant carving terrain and solving the flow field
    // twice on every single level start, the second solve throwing the
    // first away
    this.sim = new Sim(level);
    this.renderer = new Renderer(glCanvas, atlas);
    const ctx = uiCanvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.uictx = ctx;

    this.fitToMap();
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

  /**
   * Draw one complete frame and block until the driver has actually done
   * it. The raf loop is already running by now, but "a frame was queued"
   * is not "a frame is on screen": the first draw also uploads the atlas
   * and the terrain batches, and uncovering the canvas before that lands
   * shows black for a beat. gl.finish() is exactly the wrong call inside a
   * render loop and exactly the right one here, where the whole point is
   * to wait.
   */
  private warmup(): void {
    this.renderer.render(
      this.sim,
      this.zoom,
      -this.tlx * this.zoom,
      -this.tly * this.zoom,
      this.scale,
    );
    this.drawOverlay();
    // getContext with the same type returns the context the Renderer
    // already created — it does NOT make a second one — which is how a
    // sync point is reached without widening the Renderer's surface
    this.glCanvas.getContext("webgl2")?.finish();
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

  /**
   * The gear button, and the same guard esc uses: the end screens own the UI
   * outright, so there is no pause menu to raise underneath one.
   */
  openMenu(): void {
    if (this.sim.lost() || this.won()) return;
    this.menuOpen = true;
  }

  /** fast-forward toggle: any multiplier in SPEEDS; anything else is 1x */
  setSpeed(mult: number): void {
    this.speed = SPEEDS.includes(mult) ? mult : 1;
  }

  /** everything the React overlay renders, polled a few times a second */
  ui(): UiState {
    return {
      levelId: this.sim.level.id,
      tier: this.sim.level.tier ?? 0,
      enemyLevel: this.sim.level.enemyLevel ?? 0,
      remaining: this.sim.remaining(),
      byKind: this.sim.aliveByKindList(),
      nextWaveIn: this.sim.nextWaveIn(),
      currentWave: this.sim.currentWave(),
      totalWaves: this.sim.totalWaves,
      buildKind: this.buildKind,
      paused: this.paused,
      speed: this.speed,
      showRoutes: this.showRoutes,
      lost: this.sim.lost(),
      won: this.won(),
      kills: this.sim.kills,
      menuOpen: this.menuOpen,
      earned: dropsForKills(this.sim.killsByKind),
      counts: this.sim.towerCounts(),
      caps: this.tech ? this.tech.caps : null,
      unlocked: this.tech ? Array.from(this.tech.unlocked) : null,
    };
  }

  /** which map this run is played on — what a saved layout is keyed by */
  mapId(): string {
    return this.sim.level.map ?? OFFICIAL_MAP_IDS[0];
  }

  /** what is standing right now, in save shape */
  layout(): TowerPlacement[] {
    return this.sim.towers.map((t) => ({ kind: t.kind, gx: t.gx, gy: t.gy }));
  }

  /**
   * Rebuild a saved layout, and return how much of it stood back up.
   *
   * Every placement goes through placeTower, so the map and the tech tree
   * both get a veto: a cell that stopped being rock since the layout was
   * saved, or a turret whose capacity has since been spent elsewhere in the
   * same list, simply drops out. A map edited under a save therefore loses
   * the towers that no longer fit rather than restoring them into walls.
   */
  applyLayout(towers: readonly TowerPlacement[]): number {
    let placed = 0;
    for (const t of towers) if (this.sim.placeTower(t.gx, t.gy, t.kind) === "ok") placed++;
    return placed;
  }

  /** show or hide the drop zones and the air routes out of them */
  toggleRoutes(): void {
    this.showRoutes = !this.showRoutes;
  }

  reset(): void {
    this.sim.reset();
    this.menuOpen = false;
    this.fitToMap();
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

  /** re-read the loaded map's height and refit the camera to it */
  private fitToMap(): void {
    this.worldH = this.sim.terrain.rows * CELL;
    this.worldW = this.sim.terrain.cols * CELL;
    this.resize();
  }

  private clampCamera(): void {
    // a zero-sized canvas (hidden tab, collapsed layout) divides by zero in
    // any pointer-driven pan, and a NaN camera renders the world nowhere —
    // a blank screen. Snap back to the origin rather than showing void
    if (!Number.isFinite(this.tlx)) this.tlx = 0;
    if (!Number.isFinite(this.tly)) this.tly = 0;
    // cover guarantees the window fits inside the world, so these ranges are
    // never negative and no edge of the screen can fall off the map
    this.tlx = clamp(this.tlx, 0, this.worldW - this.visW());
    this.tly = clamp(this.tly, 0, this.worldH - this.visH());
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round((this.glCanvas.clientWidth || this.worldW) * dpr);
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
    this.scale = Math.max(bw / this.worldW, bh / this.worldH);
    this.zoom = clamp(this.zoom, ZOOM_MIN, ZOOM_MAX);
    this.clampCamera();
  }

  /** mouse event -> world coordinates through the camera */
  private mouseWorld(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.uiCanvas.getBoundingClientRect();
    // laid out at zero size: there is no meaningful world point, and
    // dividing by the rect would poison the camera with NaN
    if (r.width <= 0 || r.height <= 0) return { x: this.tlx, y: this.tly };
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
    if (!this.paused && !this.menuOpen && !this.sim.lost())
      for (let i = 0; i < this.speed; i++) this.sim.update(dt);
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

    // ROUTES, under everything else so a selection ring still reads on top.
    // Drop zones are rings rather than discs: the ground inside one is
    // ordinary floor a player may want to look at and build near
    if (this.showRoutes) {
      for (const r of this.sim.airRoutes()) {
        const col = SPAWN_REGIONS[(r.region - 1) % SPAWN_REGIONS.length].css;
        c.strokeStyle = col;
        c.globalAlpha = 0.5;
        c.lineWidth = 2;
        c.setLineDash([10, 8]);
        c.beginPath();
        c.moveTo(r.x1, r.y1);
        c.lineTo(r.x2, r.y2);
        c.stroke();
        c.setLineDash([]);
        // the arrowhead settles which end is the destination
        const a = Math.atan2(r.y2 - r.y1, r.x2 - r.x1);
        const hx = r.x2 - Math.cos(a) * 14, hy = r.y2 - Math.sin(a) * 14;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.moveTo(r.x2, r.y2);
        c.lineTo(hx - Math.sin(a) * 7, hy + Math.cos(a) * 7);
        c.lineTo(hx + Math.sin(a) * 7, hy - Math.cos(a) * 7);
        c.closePath();
        c.fillStyle = col;
        c.fill();
      }
      for (const z of this.sim.terrain.spawns) {
        c.strokeStyle = SPAWN_REGIONS[(z.region - 1) % SPAWN_REGIONS.length].css;
        c.globalAlpha = 0.9;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(z.x * CELL, z.y * CELL, z.r * CELL, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

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
