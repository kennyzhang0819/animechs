import { atlasReady, buildAtlas } from "./atlas";
import {
  loadOfficialMaps,
  OFFICIAL_MAP_IDS,
  OFFICIAL_MAPS,
  refreshMap,
  zoneStyle,
} from "./maps";
import { CELL, clamp, COLS, H, ROWS, TOWERS, W } from "./constants";
import { isBuildableWall } from "./terrain";
import { loadBalanceDoc } from "./balance";
import { loadLevelDocs, UNIT_KINDS, type LevelSpec, type TowerKind, type UnitKind } from "./levels";
import type { Cost } from "./items";
import { dropsForKills, type TowerPlacement } from "./progress";
import { Renderer } from "./renderer";
import { drawHaze, fitZoom } from "./haze";
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
  /** every boss on the field, one thin HUD bar each, keyed by spawn id */
  bosses: { id: number; kind: UnitKind; hp: number; max: number }[];
  /** seconds until the next wave, or 0 while one is already coming in */
  nextWaveIn: number;
  /** 1-based wave now on the field, out of how many the level holds */
  currentWave: number;
  totalWaves: number;
  /** the tower kind picked in the build bar, or null for the bare cursor */
  buildKind: TowerKind | null;
  /** the demolish tool is picked: the next press sells instead of selecting */
  sellMode: boolean;
  paused: boolean;
  /** the base is destroyed — the field is frozen behind the score screen */
  lost: boolean;
  /** the base's remaining health, and the pool the save's plating bought
   *  (tech.ts, LIVES_BASE + Extra Lives). At a max of 1 there is nothing
   *  to report — the first leak is the loss — so the HUD stays quiet */
  lives: number;
  livesMax: number;
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
  /** live towers per kind, for the bar's remaining-count cap badges */
  counts: Record<TowerKind, number>;
  /** campaign restrictions from the tech tree; null = unrestricted (editor) */
  caps: Record<TowerKind, number> | null;
  unlocked: readonly TowerKind[] | null;
  /** loadout slots the build bar holds (tech tree); null = sandbox, uncapped */
  barSlots: number | null;
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
 * The multipliers a save has BEFORE it buys any — just the pace the game
 * runs at.
 *
 * This used to be [1, 2, 4], with 8x and 16x held back as a sandbox tool.
 * 2x, 4x and 8x are now the utilities path in the tech tree (tech.ts),
 * bought one cheap currency at a time, so what a player gets is read off
 * their save (TechState.speeds) rather than written here; 16x is not sold
 * at all. Sandbox still shows every SPEEDS entry, because sandbox ignores
 * the tree entirely.
 */
export const BASE_SPEEDS: readonly number[] = [1];

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
// whichever axis overflows. It is where a run starts, but it is no longer
// the FLOOR — the camera keeps pulling back until the whole map is on
// screen with a margin of void around it. "How does my line look against
// the whole map" is a question a player asks constantly, and panning
// around at cover is a poor way to answer it.
//
// What made cover the floor was that anything past it shows empty space.
// Mindustry answers that with borderDarkness (World.getDarkness): the
// outermost tiles ramp to black, so the world ends in a soft edge and the
// void beyond it reads as deliberate rather than as a missing chunk of
// map. drawHaze is that, and it is what pays for this floor.
//
// The floor itself, the haze depth and the haze curve live in haze.ts:
// the map editor pulls back to the same floor over the same fade, and
// numbers that have to agree between two cameras belong in one file.
// A FINGERTIP COVERS FAR MORE MAP THAN A CURSOR DOES, so the ceiling has to
// leave enough room to aim at a single cell on a phone-sized viewport.
//
// The board is 256x192 cells, so "cover" on a 1280px-wide viewport puts one
// cell at 5 CSS px — a 1x1 duo was 20px across even at the old ceiling of 4,
// which is a thing you place blind rather than aim. At 12 a cell is 60px and
// the visible field is 21 cells wide on a desktop and about 7 on a phone:
// close enough to pick one turret out of a packed line, and still showing
// enough ground to see what is walking into it.
//
// Only the ceiling is a constant: zooming IN only ever crops, so it cares
// about nothing but the fingertip. The floor depends on the map and the
// viewport together, so it is computed from both (see minZoom).
const ZOOM_MAX = 12;

// ---- the frame budget (see frame and resize) --------------------------
//
// The sim's fixed step. rAF is the display's rate, not the game's: a
// 120Hz phone would run the whole simulation twice as often for motion
// nobody can see, and exactly on the devices with the least CPU to spare.
// So frame() banks real time and steps the sim in SIM_DT quanta.
const SIM_DT = 1 / 60;
// most catch-up steps one frame will run. dt is already clamped to 0.05s,
// so 3 covers an honest slow frame; anything longer (a backgrounded tab,
// a device asleep) is simply dropped rather than replayed at 16x cost —
// the spiral where slow frames beget more sim work which begets slower
// frames has to break somewhere, and losing banked time is the cheap end
const SIM_STEPS_MAX = 3;
// backing-store ceiling in device px per CSS px — see resize
const DPR_CAP = 2;

// a touch that never travels this far in CSS px is a tap — it selects the
// tower under it — and anything further is a drag that carried the camera.
// Distance is the whole test on purpose: with no tool picked there is no
// other gesture a stationary finger could mean, so resting on a turret to
// read its range must not time out into nothing
const TAP_PX = 12;
// Safari-only, and absent from the DOM typings — hence plain strings
const GESTURES = ["gesturestart", "gesturechange", "gestureend"];
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
  /**
   * THE HYDROPHOBIC COASTLINE, painted once and blitted while the build
   * menu is open — one pixel per cell, lit on the rock a turret would fire
   * a fraction of its rate from (Sim.waterloggedMask).
   *
   * A RULE THE PLAYER CANNOT SEE IS A RULE THEY CANNOT PLAN AROUND, and
   * this one is invisible by nature: the penalty lives in the GROUND, and
   * a turret standing on taxed rock looks exactly like one that is not.
   * The deploy panel names the rule; this is where it becomes a place.
   *
   * It is only up while something is being placed, because it is a
   * building decision and nothing else — a permanent wash over a third of
   * the map would compete with every unit on it.
   *
   * Null means "not built yet", which is also how it is invalidated: it is
   * per-map, so reset() drops it and the next build hover pays for the
   * rebuild once.
   */
  private soakLayer: HTMLCanvasElement | null = null;
  // the same hover in world px: the placement ghost wants the grid cell, but
  // the demolish highlight has to ask the sim what is actually under there
  private hoverX = -1;
  private hoverY = -1;

  // camera: zoom 1 fills the viewport; (tlx, tly) is the visible top-left in world px
  private zoom = 1;
  private tlx = 0;
  private tly = 0;
  private panning = false;
  private panMoved = 0;
  // cursor mode: null is the normal cursor (click a tower to inspect its
  // range); a kind from the tower menu turns on the ghost + paint placement
  private buildKind: TowerKind | null = null;
  // demolish mode: the third cursor state, and the only way to sell on a
  // touchscreen — a finger has no second button to mirror. On a mouse it is
  // simply the left button doing what the right one already does
  private sellMode = false;
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
  // live touch points in client px, keyed by pointerId and in the order they
  // went down: one finger pans (or paints, with a tool picked), two pinch
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  // a pinch is applied once a frame rather than once an event: pointermove
  // arrives per FINGER, so reading the spread on each one would measure a
  // moved finger against a stale one — two fingers sliding across the screen
  // together would wobble the zoom instead of only panning
  private pinchDirty = false;
  private tapStart: { x: number; y: number } | null = null;
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
  // real time owed to the fixed-step sim (see frame) — carried between
  // frames so a 120Hz display steps the sim on every other frame instead
  // of twice as often, and a hitch is paid back over the next few frames
  private simAcc = 0;

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
      if (this.buildKind || this.sellMode || this.selected || this.building) {
        this.buildKind = null;
        this.sellMode = false;
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
  private readonly onBlur = (): void => {
    this.keysDown.clear();
    // a touch stranded by a lost focus would make the next press read as the
    // second finger of a pinch that never started
    this.touches.clear();
    this.pinchDist = 0;
    this.pinchDirty = false;
    this.tapStart = null;
  };
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
      this.zoom = clamp(
        this.zoom * Math.exp(-dy * (pinch ? 0.012 : 0.0015)),
        this.minZoom(),
        ZOOM_MAX,
      );
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
        this.buildTo(p, false);
      } else if (this.sellMode) {
        // demolish mode puts the right button's whole chain on the left one:
        // pull down what is under the press, keep pulling on the drag
        this.selling = true;
        this.sellFrom = p;
        this.sim.sellTowerAt(p.x, p.y);
        this.dropSelectionIfGone();
      } else {
        // normal cursor: the shared inspect/focus tap (see inspectAt)
        this.inspectAt(p);
      }
    } else if (e.button === 2) {
      e.preventDefault();
      this.building = false;
      // right-click still escapes build mode first — you reach for it to put
      // the ghost away, and that press must never also demolish something
      if (this.buildKind || this.sellMode) {
        this.buildKind = null;
        this.sellMode = false;
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
    if (this.building && !this.panning) this.buildTo(p, true);
    if (this.selling && !this.panning) {
      this.sim.sellLine(this.sellFrom.x, this.sellFrom.y, p.x, p.y);
      this.sellFrom = p;
      this.dropSelectionIfGone();
    }
    this.setHover(p);
  };
  private readonly onLeave = (e: PointerEvent): void => {
    // leaving is a cursor idea. A finger's boundary events arrive AFTER its
    // pointerup — so honouring them here would undo what touchUp just set up,
    // and lifting one finger out of a pinch would leave the other one dead
    if (e.pointerType === "touch") return;
    this.clearHover();
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

  // ---- pointer routing -------------------------------------------------
  // One set of listeners covers mouse, pen and touch. Mouse and pen keep the
  // three-button scheme above; a finger has no buttons and no hover, so touch
  // gets its own gestures: one finger pans, or paints with a tool picked from
  // the bar, and two fingers pinch the MAP — never the page (see the viewport
  // meta in app/layout.tsx and onGesture below).
  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "touch") this.touchDown(e);
    else this.onMouseDown(e);
  };
  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === "touch") this.touchMove(e);
    else this.onMove(e);
  };
  private readonly onPointerUp = (e: PointerEvent): void => {
    // pointercancel is the system taking the touch away (a call arriving, an
    // edge swipe): the gesture ends, but it was never a tap
    if (e.pointerType === "touch") this.touchUp(e, e.type === "pointerup");
    else this.onMouseUp();
  };
  // Safari's own pinch, which honours neither user-scalable=no nor
  // touch-action: without these a two-finger gesture zooms the PAGE, blowing
  // the HUD up off the screen instead of zooming the map underneath it
  private readonly onGesture = (e: Event): void => e.preventDefault();

  /** the first two fingers down, which are the pair a pinch reads */
  private touchPair(): readonly [{ x: number; y: number }, { x: number; y: number }] | null {
    const [a, b] = this.touches.values();
    return a && b ? [a, b] : null;
  }

  private touchSpread(): number {
    const p = this.touchPair();
    return p ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }

  private touchMid(): { x: number; y: number } {
    const p = this.touchPair();
    return p ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 } : this.lastMouse;
  }

  private touchDown(e: PointerEvent): void {
    // kills the synthetic mouse events, the long-press callout, and the text
    // selection a drag across the canvas would otherwise start
    e.preventDefault();
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size === 2) {
      // the second finger takes the gesture over: whatever the first one was
      // doing stops where it is, and the pair drives zoom and pan together
      this.building = false;
      this.selling = false;
      this.panning = false;
      this.tapStart = null;
      this.clearHover();
      this.pinchDist = this.touchSpread();
      this.lastMouse = this.touchMid();
      this.pinchDirty = false;
      return;
    }
    if (this.touches.size > 2) return; // a third finger changes nothing
    const p = this.mouseWorld(e);
    this.tapStart = { x: e.clientX, y: e.clientY };
    if (this.buildKind) {
      // exactly the left button's chain: place under the press, then paint
      this.building = true;
      this.buildFrom = p;
      this.buildTo(p, false);
      this.setHover(p);
    } else if (this.sellMode) {
      this.selling = true;
      this.sellFrom = p;
      this.sim.sellTowerAt(p.x, p.y);
      this.dropSelectionIfGone();
      this.setHover(p);
    } else {
      // with no tool picked the finger IS the camera; a press that never
      // travels is a tap instead, and selects on release
      this.panning = true;
      this.panMoved = 0;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  }

  private touchMove(e: PointerEvent): void {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.touches.size >= 2) {
      this.pinchDirty = true; // applied in frame(), once both fingers are current
      return;
    }
    const r = this.uiCanvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (this.panning) {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.panMoved += Math.abs(dx) + Math.abs(dy);
      this.tlx -= (dx / r.width) * this.visW();
      this.tly -= (dy / r.height) * this.visH();
      this.lastMouse = { x: e.clientX, y: e.clientY };
      this.clampCamera();
      return;
    }
    const p = this.mouseWorld(e);
    if (this.building) this.buildTo(p, true);
    if (this.selling) {
      this.sim.sellLine(this.sellFrom.x, this.sellFrom.y, p.x, p.y);
      this.sellFrom = p;
      this.dropSelectionIfGone();
    }
    this.setHover(p);
  }

  /**
   * Two fingers: the distance between them sets the zoom, and the point
   * between them carries the map. Anchoring on the PREVIOUS midpoint is what
   * makes both work at once — the world under the fingers stays under the
   * fingers whether they spread, close, or slide across the screen together.
   */
  private pinch(): void {
    if (this.touches.size < 2) return;
    const r = this.uiCanvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const mid = this.touchMid();
    const dist = this.touchSpread();
    const before = this.mouseWorld({ clientX: this.lastMouse.x, clientY: this.lastMouse.y });
    if (this.pinchDist > 0 && dist > 0)
      this.zoom = clamp(this.zoom * (dist / this.pinchDist), this.minZoom(), ZOOM_MAX);
    this.pinchDist = dist;
    this.lastMouse = mid;
    this.tlx = before.x - ((mid.x - r.left) / r.width) * this.visW();
    this.tly = before.y - ((mid.y - r.top) / r.height) * this.visH();
    this.clampCamera();
  }

  private touchUp(e: PointerEvent, ended: boolean): void {
    if (!this.touches.delete(e.pointerId)) return;
    if (this.touches.size >= 2) {
      // a spare finger left: re-anchor the pinch on the two that remain
      this.pinchDist = this.touchSpread();
      this.lastMouse = this.touchMid();
      this.pinchDirty = false;
      return;
    }
    if (this.touches.size === 1) {
      // out of the pinch and back to one finger. Re-anchor on it, or the
      // camera jumps by the gap between it and the midpoint it was following
      const [only] = this.touches.values();
      if (only) this.lastMouse = { x: only.x, y: only.y };
      this.pinchDist = 0;
      this.pinchDirty = false;
      this.panMoved = 0;
      this.tapStart = null;
      // a pinch never resumes a paint stroke — only the camera
      this.panning = !this.buildKind && !this.sellMode;
      return;
    }
    const tap = this.tapStart;
    this.tapStart = null;
    this.pinchDist = 0;
    this.pinchDirty = false;
    this.panning = false;
    this.building = false;
    this.selling = false;
    this.clearHover();
    // a press that never travelled, with no tool picked, is the touch
    // spelling of a click: the shared inspect/focus tap (see inspectAt)
    if (
      ended &&
      tap &&
      !this.buildKind &&
      !this.sellMode &&
      Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < TAP_PX
    ) {
      this.inspectAt(this.mouseWorld(e));
    }
  }

  /**
   * THE BARE-CURSOR TAP, shared by mouse click and touch tap. What it does
   * depends on what is under the point, checked in the order a player
   * means them:
   *
   *   an ENEMY   — mark it for FOCUS FIRE: every turret in range drops
   *                what it was doing for it (Sim.setFocusUnit), and the
   *                mark wears a bobbing arrow so there is never a question
   *                of what the board is angry at
   *   a SHIELD TOWER   — the same mark, on the mutator's structure
   *   a TOWER    — inspect it (the range ring), as it always has
   *   nothing    — clear everything: selection and mark alike
   *
   * Units first because they are small, moving, and the thing a panicking
   * player is jabbing at; a tower is big, still, and easy to hit on
   * purpose. Tapping a tower deliberately KEEPS the mark — inspecting your
   * own range while the board burns something down is not a change of mind.
   */
  private inspectAt(p: { x: number; y: number }): void {
    const ui = this.sim.unitAt(p.x, p.y);
    if (ui >= 0) {
      this.sim.setFocusUnit(ui);
      this.selected = null;
      return;
    }
    const si = this.sim.shieldTowerAt(p.x, p.y);
    if (si >= 0) {
      this.sim.setFocusShieldTower(si);
      this.selected = null;
      return;
    }
    const t = this.sim.towerAt(p.x, p.y);
    this.selected = t;
    if (!t) this.sim.clearFocus();
  }

  /** is this world point on the map at all, or out in the void past it? */
  private inWorld(p: { x: number; y: number }): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.worldW && p.y < this.worldH;
  }

  /**
   * The build chain, shared by press and drag on both mouse and touch:
   * paint from wherever the chain last was to here (`chain`), or drop a
   * single tower under the point that starts it.
   *
   * The void guard is why this is one function. Every world→cell conversion
   * CLAMPS to the board, so a point past the map edge folds onto the rim
   * and drops a tower there — harmless while the camera could not leave the
   * map, and a way to build by clicking on nothing now that it can.
   */
  private buildTo(p: { x: number; y: number }, chain: boolean): void {
    const kind = this.buildKind;
    if (!kind || !this.inWorld(p)) return;
    // a chain whose last point was out in the void has no line to draw —
    // it restarts here, so a drag that leaves the map and comes back does
    // not paint a stripe across everything it skipped
    if (chain && this.inWorld(this.buildFrom)) {
      this.sim.placeLine(this.buildFrom.x, this.buildFrom.y, p.x, p.y, kind);
    } else {
      const sz = TOWERS[kind].size;
      this.sim.placeTower(
        clamp(Math.round(p.x / CELL - sz / 2), 0, COLS - sz),
        clamp(Math.round(p.y / CELL - sz / 2), 0, ROWS - sz),
        kind,
      );
    }
    this.buildFrom = p;
  }

  /** remember the pointer in world px, and as the cell a tool would act on */
  private setHover(p: { x: number; y: number }): void {
    // out past the edge there is no cell to aim at, and clamping would put
    // the ghost on the rim while the cursor sits in the void
    if (!this.inWorld(p)) return this.clearHover();
    this.hoverX = p.x;
    this.hoverY = p.y;
    const hsz = this.buildKind ? TOWERS[this.buildKind].size : 2;
    this.hoverGx = clamp(Math.round(p.x / CELL - hsz / 2), 0, COLS - hsz);
    this.hoverGy = clamp(Math.round(p.y / CELL - hsz / 2), 0, ROWS - hsz);
  }

  private clearHover(): void {
    this.hoverX = -1;
    this.hoverY = -1;
    this.hoverGx = -1;
    this.hoverGy = -1;
  }
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
    // the stale copy in memory — but that is true of ONE map, not all of them
    // The level SCRIPT is re-read here too, for the same reason. Both
    // editors return through a client-side route, so an edited wave script
    // is as capable of being stale as an edited map — and applyBlueprint
    // derives every WORLDS entry's script in place, including the object
    // this spec already points at, so the sim built below picks it up
    await begin("map");
    const mapId = spec.map ?? OFFICIAL_MAP_IDS[0];
    await Promise.all([
      OFFICIAL_MAPS.length === 0 ? loadOfficialMaps() : refreshMap(mapId),
      loadLevelDocs(),
      // tech prices are read the moment the tech screen opens, so the
      // coefficients have to land before the game does
      loadBalanceDoc(),
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
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("wheel", this.onWinWheel, { passive: false });
    for (const g of GESTURES) window.addEventListener(g, this.onGesture, { passive: false });
    uiCanvas.addEventListener("wheel", this.onWheel, { passive: false });
    uiCanvas.addEventListener("pointerdown", this.onPointerDown);
    uiCanvas.addEventListener("pointermove", this.onPointerMove);
    uiCanvas.addEventListener("pointerleave", this.onLeave);
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
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("wheel", this.onWinWheel);
    for (const g of GESTURES) window.removeEventListener(g, this.onGesture);
    this.uiCanvas.removeEventListener("wheel", this.onWheel);
    this.uiCanvas.removeEventListener("pointerdown", this.onPointerDown);
    this.uiCanvas.removeEventListener("pointermove", this.onPointerMove);
    this.uiCanvas.removeEventListener("pointerleave", this.onLeave);
    this.uiCanvas.removeEventListener("contextmenu", this.onContext);
  }

  setBuildKind(kind: TowerKind | null): void {
    if (kind && this.tech && !this.tech.unlocked.has(kind)) return;
    this.buildKind = kind;
    if (kind) {
      this.sellMode = false;
      this.selected = null;
    }
  }

  /**
   * The demolish tool. On a mouse it is a convenience over the right button;
   * on a touchscreen it is the only way to sell at all, which is why it sits
   * in the tower bar next to the turrets rather than behind a modifier.
   */
  setSellMode(on: boolean): void {
    this.sellMode = on;
    if (on) {
      this.buildKind = null;
      this.selected = null;
    }
  }

  /** the on-screen menu button — esc, for a screen with no keyboard */
  openMenu(): void {
    if (this.sim.lost() || this.won()) return;
    this.buildKind = null;
    this.sellMode = false;
    this.menuOpen = true;
  }

  /** the on-screen pause button — space, for a screen with no keyboard */
  togglePause(): void {
    if (this.menuOpen) return; // the menu already holds the sim
    this.paused = !this.paused;
  }

  /** apply the save's tower unlocks and caps; null lifts them (editor, dev) */
  setTech(tech: TechState | null): void {
    this.tech = tech;
    this.sim.setTech(tech);
  }

  /**
   * The ambient-effects switch, both halves at once — the sim stops
   * pushing dressing into the effect pool (Sim.setEffects, which keeps
   * every effect that IS a weapon) and the renderer drops the decoration
   * it owns itself and stands scorch's flame back up (Renderer.setEffects).
   *
   * Live: it can be thrown mid-run and takes hold on the next frame.
   * Effects already in flight play out their remaining life rather than
   * vanishing mid-puff, which is a frame or two and reads as the tail of
   * what was already on screen.
   */
  setEffects(on: boolean): void {
    this.sim.setEffects(on);
    this.renderer.setEffects(on);
  }

  /** the whole script is dealt with and the base stands */
  private won(): boolean {
    return !this.sim.lost() && this.sim.remaining() <= 0;
  }

  /** the esc menu's Resume button */
  closeMenu(): void {
    this.menuOpen = false;
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
      bosses: this.sim.bossBars().map((b) => ({ ...b, kind: UNIT_KINDS[b.kind] })),
      nextWaveIn: this.sim.nextWaveIn(),
      currentWave: this.sim.currentWave(),
      totalWaves: this.sim.totalWaves,
      buildKind: this.buildKind,
      sellMode: this.sellMode,
      paused: this.paused,
      speed: this.speed,
      showRoutes: this.showRoutes,
      lost: this.sim.lost(),
      lives: this.sim.lives,
      livesMax: this.sim.livesMax,
      won: this.won(),
      kills: this.sim.kills,
      menuOpen: this.menuOpen,
      earned: dropsForKills(this.sim.killsByKind),
      counts: this.sim.towerCounts(),
      caps: this.tech ? this.tech.caps : null,
      unlocked: this.tech ? Array.from(this.tech.unlocked) : null,
      // sandbox stages runs for filming with the whole roster — the loadout
      // cap is a campaign rule, so null lifts it there like the others
      barSlots: this.tech ? this.tech.barSlots : null,
    };
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
    this.soakLayer = null; // a new level is a new coastline
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

  /**
   * The zoom floor: fit the whole map on screen, then keep going by
   * ZOOM_FIT_PAD so it sits in the void rather than against the frame.
   *
   * this.scale is the COVER scale (the axis that overflows), so dividing
   * the FIT scale by it gives fit in zoom units — at most 1, and exactly 1
   * only when the map and the viewport share an aspect ratio. A zero-sized
   * canvas has no meaningful fit, so it falls back to cover and lets
   * resize() sort it out once there is a layout.
   */
  private minZoom(): number {
    return fitZoom(
      this.uiCanvas.width,
      this.uiCanvas.height,
      this.worldW,
      this.worldH,
      this.scale,
    );
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
    // THE CENTRE OF THE SCREEN STAYS OVER THE MAP. That is the whole rule,
    // and it is the only one: pan, drag and WASD all run out into the void
    // exactly as if the map were a small island in a much bigger field,
    // rather than stopping dead at the edge of the terrain.
    //
    // It replaces a pair of clamps that pinned the camera inside the map,
    // which at any zoom past fit had no range left to give and had to
    // centre the map instead — the camera going rigid the moment the whole
    // map was on screen. Reading the constraint off the screen's centre
    // instead of its corners is what makes one line cover every zoom: the
    // range is always exactly the map, so it is never empty and never
    // backwards, and the furthest you can push an edge is to the middle of
    // the screen — far enough to look at a corner in isolation, never far
    // enough to lose the map off the side.
    const halfW = this.visW() / 2, halfH = this.visH() / 2;
    this.tlx = clamp(this.tlx, -halfW, this.worldW - halfW);
    this.tly = clamp(this.tly, -halfH, this.worldH - halfH);
  }

  private resize(): void {
    // capped at 2, not 3: a dpr-3 phone renders 2.25x the pixels of dpr 2
    // for sharpness this art style cannot show, and fullscreen fill rate
    // is the first thing a mobile GPU runs out of
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
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
    this.zoom = clamp(this.zoom, this.minZoom(), ZOOM_MAX);
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

    if (this.pinchDirty) {
      this.pinchDirty = false;
      this.pinch();
    }

    // keyboard pan: half a viewport per second
    for (const code of this.keysDown) {
      const dir = PAN_KEYS[code];
      this.tlx += dir[0] * this.visW() * 0.5 * dt;
      this.tly += dir[1] * this.visH() * 0.5 * dt;
    }
    if (this.keysDown.size > 0) this.clampCamera();

    const t0 = performance.now();
    // a lost game freezes mid-carnage: the score screen sits over the
    // exact frame the base fell on, until retry resets the sim. The esc
    // menu holds the sim the same way. A won game keeps running — the
    // field is empty and the last death effects get to play out
    if (!this.paused && !this.menuOpen && !this.sim.lost()) {
      // fixed 60Hz stepping off banked real time (see SIM_DT): a 144Hz
      // display steps on some frames and not others, a 30Hz one steps
      // twice a frame, and both play the same game at the same rate
      this.simAcc += dt;
      for (let s = 0; this.simAcc >= SIM_DT && s < SIM_STEPS_MAX; s++) {
        this.simAcc -= SIM_DT;
        for (let i = 0; i < this.speed; i++) this.sim.update(SIM_DT);
      }
      // time the step cap refused is forfeit, not owed (see SIM_STEPS_MAX)
      if (this.simAcc >= SIM_DT) this.simAcc = 0;
    } else {
      // a held sim owes nothing: without this, time banked while paused
      // would replay as a burst of catch-up steps on unpause
      this.simAcc = 0;
    }
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

  /**
   * The map's rim, hazed into the void it sits in.
   *
   * Mindustry's borderDarkness (World.getDarkness): the outermost tiles
   * ramp to black so the world ends in a soft edge instead of a cut. Same
   * idea, four gradients instead of per-tile darkness — this board has no
   * darkness channel, and a straight edge each way is all there is to hide.
   *
   * It is the CLEAR colour rather than black because that is what is
   * actually out there: the GL pass clears the whole canvas to it before
   * any terrain lands, so the first stop of each gradient is the exact
   * colour of the pixel beyond it and the map's edge stops existing.
   * Corners take haze from two bands, which is right — it pools where they
   * meet, and alpha compositing gets there smoothly on its own.
   *
   * This replaced a lumpier version that baked billows into a strip and
   * stretched it along each edge. Irregularity that is BUILT is
   * irregularity you can find: every lump had a radius, and where the brush
   * ran past the inner face of the band it was cut off square, which put a
   * visible straight border in the one place the whole effect exists to
   * remove. A plain gradient with a long enough tail has no such place.
   */
  private drawHaze(c: CanvasRenderingContext2D): void {
    drawHaze(c, this.worldW, this.worldH);
  }

  /**
   * Paint the Hydrophobic mask onto a COLS x ROWS bitmap — ONLY where a
   * turret could actually stand, which is buildable rock (isBuildableWall,
   * the same test canPlace makes). The mask itself covers water and road
   * as well, and lighting those would be telling the player about ground
   * they can never build on in the first place.
   *
   * Periwinkle, the same blue the codex draws an exclusive rule in
   * (mutationFace.tsx) — a player who has read the card should recognise
   * the colour on the ground without being told twice.
   */
  private buildSoakLayer(): HTMLCanvasElement | null {
    const mask = this.sim.waterloggedMask();
    if (!mask) return null;
    const cv = document.createElement("canvas");
    cv.width = COLS;
    cv.height = ROWS;
    const cc = cv.getContext("2d");
    if (!cc) return null;
    const img = cc.createImageData(COLS, ROWS);
    const { blocked, wall } = this.sim.terrain;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || !blocked[i] || !isBuildableWall(wall[i])) continue;
      const p = i * 4;
      img.data[p] = 0x8a;
      img.data[p + 1] = 0xa2;
      img.data[p + 2] = 0xff;
      img.data[p + 3] = 255;
    }
    cc.putImageData(img, 0, 0);
    return cv;
  }

  private drawOverlay(): void {
    const c = this.uictx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    // world-space transform through the camera
    const s = this.scale * this.zoom;
    c.setTransform(s, 0, 0, s, -this.tlx * s, -this.tly * s);
    // first, so everything below stays crisp on top of it: a range ring or
    // a build ghost at the map's rim has to stay readable even where the
    // ground under it is fading out
    this.drawHaze(c);

    // THE TAXED SHORE, while a turret is in hand. Under the routes and the
    // ghost, both of which are decisions being made ON TOP of it
    if (this.buildKind && this.sim.hydrophobicOn) {
      const layer = this.soakLayer ?? (this.soakLayer = this.buildSoakLayer());
      if (layer) {
        c.globalAlpha = 0.3;
        // one pixel per cell blown up to CELL: no smoothing, or the edge
        // of the tax would blur across the cells it does not cover
        c.imageSmoothingEnabled = false;
        c.drawImage(layer, 0, 0, W, H);
        c.imageSmoothingEnabled = true;
        c.globalAlpha = 1;
      }
    }

    // ROUTES, under everything else so a selection ring still reads on top.
    // Drop zones are rings rather than discs: the ground inside one is
    // ordinary floor a player may want to look at and build near
    if (this.showRoutes) {
      for (const r of this.sim.airRoutes()) {
        const col = zoneStyle(r.zone).css;
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
        c.strokeStyle = zoneStyle(z.zone).css;
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
      // the LIVE range, not the table's: an upgrade branch that lengthened
      // this turret's reach has to move the ring it is drawn with, or the
      // ring becomes a lie about what the turret can shoot (Sim.statsFor)
      c.arc(t.x, t.y, this.sim.statsFor(t.kind).range, 0, Math.PI * 2);
      c.fillStyle = "rgba(255,211,127,0.06)";
      c.fill();
      c.strokeStyle = "rgba(255,211,127,0.7)";
      c.lineWidth = 1.5;
      c.stroke();
      const selPx = TOWERS[t.kind].size * CELL;
      c.strokeRect(t.gx * CELL + 1, t.gy * CELL + 1, selPx - 2, selPx - 2);
    }

    // THE FOCUS MARK (Sim.setFocusUnit / setFocusShieldTower): a bobbing red
    // arrow over the tapped target, so what the board was told to burn is
    // never a question. Rides sim time, so it holds still under pause and
    // keeps pace at 4x exactly as its target does
    const mark = this.sim.focusMark();
    if (mark) {
      const bob = Math.sin(this.sim.time * 6) * 3;
      const ax = mark.x, ay = mark.top - 12 + bob;
      c.beginPath();
      c.moveTo(ax, ay + 10); // the tip, pointing down at the target
      c.lineTo(ax - 8, ay - 2);
      c.lineTo(ax - 3.5, ay - 2);
      c.lineTo(ax - 3.5, ay - 11);
      c.lineTo(ax + 3.5, ay - 11);
      c.lineTo(ax + 3.5, ay - 2);
      c.lineTo(ax + 8, ay - 2);
      c.closePath();
      c.fillStyle = "#FF5A5A";
      c.fill();
      c.strokeStyle = "rgba(24,10,10,0.9)";
      c.lineWidth = 1.5;
      c.stroke();
    }

    // demolish mode: outline what a press would pull down, so the tool reads
    // as a tool and not as a mode with nothing to show for itself
    if (this.sellMode && this.hoverX >= 0 && !this.panning) {
      const t = this.sim.towerAt(this.hoverX, this.hoverY);
      if (t) {
        const px = TOWERS[t.kind].size * CELL;
        c.fillStyle = "rgba(255,90,90,0.28)";
        c.fillRect(t.gx * CELL, t.gy * CELL, px, px);
        c.strokeStyle = "rgba(255,90,90,0.9)";
        c.lineWidth = 1.5;
        c.strokeRect(t.gx * CELL + 1, t.gy * CELL + 1, px - 2, px - 2);
      }
    }

    if (this.buildKind && this.hoverGx >= 0 && !this.panning) {
      // red marks anything that blocks the spot: walls, the base, units
      // underneath, or a placement that would seal the swarm's last route
      const sz = TOWERS[this.buildKind].size;
      const px = sz * CELL;
      const ok = this.sim.canPlace(this.hoverGx, this.hoverGy, this.buildKind);
      const x = this.hoverGx * CELL, y = this.hoverGy * CELL;
      // a legal spot that the Hydrophobic rule TAXES is drawn in the
      // exclusive rule's own blue rather than the ordinary amber: the
      // placement is allowed, so it must not read as refused, but most of
      // a turret's damage is worth a colour of its own
      const soaked = ok && this.sim.isWaterlogged(this.hoverGx, this.hoverGy, this.buildKind);
      const tint = !ok
        ? ["rgba(255,90,90,0.3)", "rgba(255,90,90,0.9)"]
        : soaked
          ? ["rgba(138,162,255,0.22)", "rgba(138,162,255,0.95)"]
          : ["rgba(255,211,127,0.14)", "rgba(255,211,127,0.85)"];
      c.fillStyle = tint[0];
      c.fillRect(x, y, px, px);
      c.strokeStyle = tint[1];
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
