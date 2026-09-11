import { BUILD } from "./version";
import { atlasReady, buildAtlas } from "./atlas";
import {
  loadOfficialMaps,
  OFFICIAL_MAP_IDS,
  OFFICIAL_MAPS,
  paintThumb,
  refreshMap,
  zoneStyle,
} from "./maps";
import { SHIELD_TOWER_SIZE } from "./mutation";
import {
  CELL,
  clamp,
  COLS,
  H,
  ROWS,
  structStats,
  targetingLine,
  TOWERS,
  towerMaxHp,
  W,
} from "./constants";
import { loadBalanceDoc } from "./balance";
import {
  loadLevelDocs,
  UNIT_KINDS,
  type LevelSpec,
  type Mission,
  type TowerKind,
  type UnitKind,
} from "./levels";
import { missionXp, scrapPriceOf, sellValue } from "./economy";
import { HEALTH_BARS_DEFAULT, type HealthBarMode, type TowerPlacement } from "./progress";
import { TOWER_KINDS } from "./types";
import { Renderer } from "./renderer";
import { fitZoom } from "./fit";
import { PICK_LENIENT, PICK_STRUCT_PAD, Sim } from "./sim";
import { type TechState } from "./tech";
import { isCore } from "./types";

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
  /** seconds of simulated time since the run started (Sim.time) */
  elapsed: number;
  /** 1-based wave now on the field, out of how many the level holds */
  currentWave: number;
  totalWaves: number;
  /** the tower kind picked in the build bar, or null for the bare cursor */
  buildKind: TowerKind | null;
  /** the demolish tool is picked: the next press sells instead of selecting */
  paused: boolean;
  /** the core is destroyed — the field is frozen behind the score screen */
  lost: boolean;
  /** the core's health pool (CORE_HP in constants.ts) — the run itself */
  coreHp: number;
  coreHpMax: number;
  /** the mission is met (Sim.won) — the success screen takes over */
  won: boolean;
  /** what this map asks (levels.ts): the HUD says it the way the deploy panel did */
  mission: Mission;
  /** seconds left on a survive mission's clock; 0 where there is no clock */
  timeLeft: number;
  kills: number;
  /** the esc game menu is up: sim held, resume or abandon from the overlay */
  menuOpen: boolean;
  /** simulation speed multiplier: one of SPEEDS */
  speed: number;
  /** is the drop-zone and air-route overlay on? */
  showRoutes: boolean;
  /**
   * THE RUN'S SCRAP (economy.ts): what is in hand to build with, or null
   * when building is free — a sandbox or an editor, where a counter would
   * be a number that means nothing
   */
  scrap: number | null;
  /** everything the run has taken in so far — drops and wave bonuses */
  scrapEarned: number;
  /** how many of the mission's waves are cleared — every body they sent is down */
  wavesCleared: number;
  /** the XP those cleared waves have banked so far, before the rung bonus */
  xp: number;
  /** what each turret costs to place right now, in scrap */
  prices: Record<TowerKind, number>;
  /** what each turret sells back for */
  refunds: Record<TowerKind, number>;
  /** live towers per kind, for the bar's standing-count badges */
  counts: Record<TowerKind, number>;
  /** the turrets the save may field; null = unrestricted (editor, sandbox) */
  unlocked: readonly TowerKind[] | null;
  /** who each turret will shoot at, in the player's words — one line under
   *  the build card's description. It reads the turret's LIVE stats, so an
   *  arc with Ionised Air bought reads "ground and air" the moment it is */
  targeting: Record<TowerKind, string>;
}

export interface Stats {
  units: number;
  kills: number;
  simMs: number;
  fps: number;
  zoom: number;
}

/** the speeds the HUD toggle offers */
export const SPEEDS: readonly number[] = [1, 2, 4, 8, 16];

/** every turret's scrap price, read fresh so a dashboard edit shows at once */
const PRICES = (): Record<TowerKind, number> =>
  Object.fromEntries(TOWER_KINDS.map((k) => [k, scrapPriceOf(k)])) as Record<TowerKind, number>;
const REFUNDS = (): Record<TowerKind, number> =>
  Object.fromEntries(TOWER_KINDS.map((k) => [k, sellValue(k)])) as Record<TowerKind, number>;

/**
 * The multipliers a save has BEFORE the track hands it any — just the
 * pace the game runs at. 2x is a level reward (track.ts), so what a
 * player gets is read off their save (TechState.speeds) rather than
 * written here; 4x, 8x and 16x are sandbox tools and never earned.
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
 * THE STAGES OF STARTING THE GAME ITSELF, as the boot screen reports them.
 *
 * A level's steps (LOAD_STEPS) are about one map; these are about the page,
 * and everything on this list is paid ONCE for the whole session. They are
 * the work that has to be finished before the front of house is worth
 * showing at all:
 *
 *   sprites  the atlas — every sprite in the game cut, packed and drawn
 *            onto one sheet (atlas.ts). The one genuinely long step, and
 *            the thing every other step and every screen after it needs.
 *   maps     the documents that live outside the module graph and are
 *            fetched rather than imported: the official maps, the level
 *            scripts and the balance coefficients.
 *   warmup   the work that has to COMPILE or be CUT before a frame can be
 *            drawn — the turret pictures sliced out of the sheet for the
 *            build bar and the deploy screen, and the WebGL renderer
 *            itself: its context, its shader programs and the sheet
 *            uploaded as a texture, all of which happen the first time the
 *            menu's ground is drawn (MenuBackground). A run started from
 *            the menu therefore steps straight to reading its map.
 *
 * It exists because the title card used to come up over black and the
 * ground arrive under it seconds later, with the first press of Start
 * paying for the shaders all over again.
 */
export const BOOT_STEPS = ["sprites", "maps", "warmup"] as const;
export type BootStep = (typeof BOOT_STEPS)[number];

export const BOOT_STEP_LABEL: Record<BootStep, string> = {
  sprites: "Packing sprites",
  maps: "Reading the maps",
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
// Every map's rim is rock, and the darkness inside the hills
// (Renderer.drawDarkness, Mindustry's own darkness buffer) takes that
// rock to black on its own, so the world ends in a soft edge and the void
// beyond it reads as deliberate rather than as a missing chunk of map.
// That is what pays for this floor; the haze that used to be laid over
// the rim on top of it is gone.
//
// The floor itself lives in fit.ts: the map editor pulls back to the same
// floor, and a number two cameras have to agree on belongs in one file.
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
/**
 * WHERE A RUN OPENS: this far in from cover (zoom 1 fills the viewport
 * with the map), centred on the core — the thing the run is about, and
 * the place a first line is laid round. On a 1600px-wide
 * viewport it puts about 85 cells across the screen: the core's basin
 * and the mouths of the lanes into it, with a cell 19px wide, which is a
 * cell that can be aimed at.
 */
const START_ZOOM = 3;

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
/**
 * THE PAN RATE: how much of the viewport the camera crosses per second
 * under a held key or a cursor at the screen's edge, at the default
 * setting. The Controls tab multiplies it (setPanSpeed), and the same
 * number drives both, so one knob is one feel.
 */
const PAN_RATE = 0.5;
/** the minimap's backing store, in device px per cell — 2 so a unit's
 *  dot is a 2x2 square and the viewport's rectangle has a crisp 1-cell stroke */
// one backing pixel a cell: 512 for the grid, sized down by CSS to its corner
const MM_SCALE = 1;
/**
 * HOW BIG A THING ON THE MINIMAP HAS TO READ, in CSS px of the corner
 * canvas. The backing store is a pixel a cell and CSS shrinks it (256
 * cells into 13rem is about four fifths of a pixel a cell), so anything
 * drawn at its true size lands on a fraction of a screen pixel: a body
 * was one such fraction and a turret barely more, and the corner said
 * nothing about where the swarm was. Marks are therefore DILATED — every
 * body and every structure is painted as a square at least this many
 * screen px across, centred where the thing is — so the map answers
 * "where are they" at a glance and keeps its true scale only for the
 * ground under it. Bodies read a touch smaller than structures: a line of
 * turrets is what the map is read for, and it wins the overdraw.
 */
const MM_UNIT_PX = 2.5;
const MM_STRUCT_PX = 3;
/** how often the minimap's CSS width is measured, in draws. Reading
 *  clientWidth is a layout read, and one per frame is a reflow per frame;
 *  the width only moves when the window or the HUD's zoom does */
const MM_CSS_EVERY = 30;

/**
 * THE BAR STACK over a thing on the board (Game.drawBars), in world px.
 * One height for every bar in the game so a row of buildings reads as a
 * row rather than a ragged fence.
 */
/** how far the hand must travel for a press to be a marquee, in screen px */
const SEL_DRAG_PX = 5;
const SEL_LIKE_STRUCT_R = CELL * 40;
/**
 * WHAT COUNTS AS A DOUBLE CLICK, in ms and in screen px between the two
 * presses. The browser's own count (MouseEvent.detail) cannot be used: the
 * board listens on POINTER events, whose detail is 0 by specification, so
 * the second click of a double arrived indistinguishable from the first
 * and the gesture simply did not work. This is that count, kept by hand.
 */
const DBL_MS = 380;
const DBL_PX = 6;
/** the marquee's amber — the team's own colour, as the unit rings wear it */
const SELECT_RING = "rgba(255,211,127,0.9)";

const BAR_H = 3.5;
const BAR_GAP = 1.5;
/** ...and a floor on the width, so a 1x1 turret's bar is still a bar */
const BAR_MIN_W = 14;
const BAR_BACK = "rgba(10,14,26,0.72)";
const BAR_EDGE = "rgba(0,0,0,0.55)";
/** what is going up (Tower.buildT) — the accent gold */
const BAR_BUILD = "#FFD37F";
/** a health bar's colour at a fraction of full, the HUD's own three */
const hpColor = (f: number): string => (f > 0.5 ? "#7BE58A" : f > 0.2 ? "#FFD37F" : "#FF5A5A");
/**
 * THE SWARM'S HEALTH IS RED AND STAYS RED. The player's own bar runs the
 * three-colour ramp because its colour is a WARNING — green to amber to
 * red is the run going wrong. Nothing is going wrong when a swarm body is
 * down to a fifth, so its bar carries no ramp at all: red says whose it is
 * (the one thing worth reading at a glance on a field of two armies) and
 * the LENGTH says how much is left, which is what a bar is for.
 */
const ENEMY_HP = "#FF5A5A";
/** how far from the cursor a body still counts as the one under it, in world px */
const HOVER_MIN_R = 10;
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
  /** the Controls tab's multiplier on PAN_RATE, keys and edges alike */
  private panSpeed = 1;
  /**
   * WHO WEARS A HEALTH BAR ON THE FIELD — the Interface tab's two knobs,
   * one a side (setHealthBars). They govern units and buildings alike:
   * a wall and a walker are both things with health standing on the board.
   */
  private allyBars: HealthBarMode = HEALTH_BARS_DEFAULT;
  private enemyBars: HealthBarMode = HEALTH_BARS_DEFAULT;
  // THE MINIMAP (attachMinimap, drawMinimap): the whole map at a glance,
  // the field on it and the viewport's frame; a press or
  // a drag on it puts that place in view
  private mmCanvas: HTMLCanvasElement | null = null;
  /** the ground at 1px a cell (paintThumb), painted once per map */
  private mmBase: HTMLCanvasElement | null = null;
  /** the per-frame layer over the ground: bodies and structures */
  private mmLayer: HTMLCanvasElement | null = null;
  /** ...and the pixels it is painted into, kept between frames. A 512-cell
   *  map is a megabyte of RGBA, and asking the context for a new one every
   *  frame is sixty megabytes a second of garbage for a buffer that is
   *  wiped and refilled anyway. Re-made only when the map's size changes */
  private mmPixels: ImageData | null = null;
  /** the minimap's CSS width in px and the countdown to measuring it
   *  again (MM_CSS_EVERY) — what a dilated mark's size is worked out from */
  private mmCssW = 0;
  private mmCssTick = 0;
  private mmDrag = false;
  // cursor mode: null is the normal cursor (click a tower to inspect its
  // range); a kind from the tower menu turns on the ghost + paint placement
  private buildKind: TowerKind | null = null;
  private building = false;
  private buildFrom = { x: 0, y: 0 };
  /**
   * THE RULER (Sim.rulerCells): shift held while a building is in hand
   * turns the drag from a paint into a straight, packed line of them from
   * where the press landed to where the cursor is. It PLACES NOTHING until
   * the hand comes up — the line is a ghost the player can swing round and
   * lengthen first, which is the whole difference between a ruler and a
   * brush that happens to go straight.
   */
  private ruler = false;
  private rulerFrom = { x: 0, y: 0 };
  // right button = demolish, the exact mirror of the left button's build
  // chain: the press pulls down whatever is under it and the drag keeps
  // pulling down everything it crosses. Panning therefore lives on the
  // MIDDLE drag and on WASD/arrows (see PAN_KEYS), not here
  private selling = false;
  private sellFrom = { x: 0, y: 0 };
  /**
   * THE MARQUEE. A left press on bare ground with no turret in hand starts
   * one: held and dragged it is a region select, released on the spot it is
   * a click. Which of the two it was is only known on release, so the press
   * itself commits to nothing.
   */
  private selecting = false;
  private selFrom = { x: 0, y: 0 };
  private selTo = { x: 0, y: 0 };
  /** where the press was in SCREEN px — a drag is a drag by what the hand
   *  did, not by how much world the zoom put under it */
  private selFromScreen = { x: 0, y: 0 };
  private selDragPx = 0;
  /** modifiers taken at the press: shift adds to the selection, ctrl (or a
   *  double click) takes everything like the thing under the cursor —
   *  bodies or buildings, whichever it landed on (gatherLike) */
  private selAdd = false;
  private selLike = false;
  /** the last left press, for the double click the pointer events cannot count */
  private lastClickAt = 0;
  private lastClickX = 0;
  private lastClickY = 0;
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
  // real time owed to the fixed-step sim (see frame) — carried between
  // frames so a 120Hz display steps the sim on every other frame instead
  // of twice as often, and a hitch is paid back over the next few frames
  private simAcc = 0;

  private readonly onResize = (): void => this.resize();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === "Escape") {
      this.toggleMenu();
      return;
    }
    // DELETE (or backspace) sells every selected building — a gathered
    // row goes in one keypress rather than a right-drag along it
    if ((e.code === "Delete" || e.code === "Backspace") && !e.repeat) {
      if (this.menuOpen || this.sim.lost() || this.won()) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      this.sim.sellSelected();
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
  };
  // THE MINIMAP'S POINTER: a press puts the place under it in view, and
  // the press held is a drag of the view — captured, so a drag that runs
  // off the minimap keeps steering until the button is let go
  private readonly onMmDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    this.mmDrag = true;
    this.mmCanvas?.setPointerCapture(e.pointerId);
    this.lookAtMinimap(e);
  };
  private readonly onMmMove = (e: PointerEvent): void => {
    if (this.mmDrag) this.lookAtMinimap(e);
  };
  private readonly onMmUp = (): void => {
    this.mmDrag = false;
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
        // the ghost already shows red where placement fails.
        // ...unless SHIFT is down, which makes the drag a ruler: it lays
        // its line down on release and nothing before then
        this.building = true;
        this.buildFrom = p;
        this.rulerFrom = p;
        this.ruler = e.shiftKey;
        if (!this.ruler) this.buildTo(p, false);
      } else {
        // normal cursor: a press starts a marquee and decides nothing.
        // What it meant is settled on release (onMouseUp)
        this.selecting = true;
        this.selFrom = p;
        this.selTo = p;
        this.selFromScreen = { x: e.clientX, y: e.clientY };
        this.selDragPx = 0;
        this.selAdd = e.shiftKey;
        const now = performance.now();
        const dbl =
          now - this.lastClickAt < DBL_MS &&
          Math.hypot(e.clientX - this.lastClickX, e.clientY - this.lastClickY) < DBL_PX;
        this.lastClickAt = now;
        this.lastClickX = e.clientX;
        this.lastClickY = e.clientY;
        this.selLike = e.ctrlKey || e.metaKey || dbl;
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
      const p = this.mouseWorld(e);
      // otherwise it demolishes on press and chains from here, exactly like
      // the left button builds on press and chains from there
      this.selling = true;
      this.sellFrom = p;
      this.sim.sellTowerAt(p.x, p.y);
    } else if (e.button === 1) {
      e.preventDefault();
      this.building = false;
      this.panning = true;
      this.panMoved = 0;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };
  private readonly onMouseUp = (e: MouseEvent): void => {
    const wasBuilding = this.building;
    this.selling = false;
    this.panning = false;
    this.building = false;
    // THE RULER LAYS ITS LINE DOWN HERE, on the release: everything before
    // this was a ghost the hand was still aiming
    if (wasBuilding && this.ruler && this.buildKind) {
      const q = this.mouseWorld(e);
      this.sim.placeRuler(this.rulerFrom.x, this.rulerFrom.y, q.x, q.y, this.buildKind);
    }
    this.ruler = false;
    if (!this.selecting) return;
    this.selecting = false;
    const p = this.mouseWorld(e);
    // A DRAG IS A REGION, a click is a point. The threshold is in screen
    // px so it means the same thing at every zoom
    if (this.selDragPx > SEL_DRAG_PX) {
      this.sim.structsInRect(this.selFrom.x, this.selFrom.y, p.x, p.y, this.selAdd);
      return;
    }
    // ctrl, or the second click of a double: everything like the thing under
    // the cursor, within reach of it — BODIES FIRST and then BUILDINGS, in
    // the same order and for the same reason a plain click asks (pickAt).
    // The near miss is forgiven here too — a gathering click that lands a
    // hair off the walker it meant should gather the group, not empty the
    // selection — so each half is asked tight first, and only once both have
    // come back empty is either asked again with the forgiving reach.
    if (this.selLike && this.gatherLike(p)) return;
    this.pickAt(p);
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
    if (this.selecting) {
      this.selTo = p;
      this.selDragPx = Math.hypot(e.clientX - this.selFromScreen.x, e.clientY - this.selFromScreen.y);
    }
    if (this.building && !this.panning) {
      // SHIFT IS READ LIVE, not latched at the press: a drag that started
      // free-hand becomes a ruler the moment the key goes down and a brush
      // again the moment it comes up — and letting go picks the chain back
      // up from HERE, so the stretch the ruler was previewing is not
      // painted over in one stripe
      const ruler = e.shiftKey;
      if (ruler && !this.ruler) this.rulerFrom = p;
      if (!ruler && this.ruler) this.buildFrom = p;
      this.ruler = ruler;
      if (!ruler) this.buildTo(p, true);
    }
    if (this.selling && !this.panning) {
      this.sim.sellLine(this.sellFrom.x, this.sellFrom.y, p.x, p.y);
      this.sellFrom = p;
    }
    this.setHover(p);
  };
  private readonly onLeave = (): void => {
    this.clearHover();
    this.panning = false;
    this.building = false;
    this.selling = false;
    // a marquee whose release happened off the canvas is abandoned rather
    // than applied to wherever the cursor left
    this.selecting = false;
  };
  private readonly onContext = (e: Event): void => e.preventDefault();

  /**
   * THE GATHERING CLICK — ctrl, or the second click of a double: take
   * everything LIKE the thing under the cursor and near it, bodies or
   * buildings alike (Sim.selectLike, Sim.selectStructsLike). A line of
   * turrets is selected the way a squad is: click one of them.
   *
   * Bodies are asked before buildings for the same reason pickAt asks them
   * first: a body is small and moving and a building is big and still, so a
   * click that could be either was aimed at the body. Whichever half
   * answers replaces the OTHER half of the selection, exactly as a plain
   * click does — shift keeps both.
   *
   * Returns false when nothing of ours was under the point at all, which
   * leaves the click to be an ordinary one (pickAt) rather than nothing:
   * ctrl held over an enemy still marks it, and over bare ground still
   * clears.
   */
  private gatherLike(p: { x: number; y: number }): boolean {
    const sim = this.sim;
    // tight first, and the forgiving reach only once that came back empty
    for (const structPad of [0, PICK_STRUCT_PAD] as const)
      if (sim.selectStructsLike(p.x, p.y, SEL_LIKE_STRUCT_R, this.selAdd, structPad) > 0) return true;
    return false;
  }

  /**
   * THE BARE-CURSOR CLICK — everything one left click on the board can
   * mean, in the order a player means them:
   *
   *   an ENEMY   — mark it for FOCUS FIRE: every turret in range drops
   *                what it was doing for it (Sim.setFocusUnit), and the
   *                mark wears a bobbing arrow so there is never a question
   *                of what the board is angry at
   *   a SHIELD TOWER   — the same mark, on the mutator's structure
   *   a BUILDING OF OURS — SELECT IT, which is what draws its range ring
   *                and what the delete key sells. Shift adds it to whatever
   *                is already held: a row of duos and the core is a
   *                selection a hand can build one click at a time
   *   nothing    — clear everything: selection and mark alike
   *
   * Bodies first because they are small, moving, and the thing a panicking
   * player is jabbing at; a building is big, still, and easy to hit on
   * purpose. Everything above is asked TIGHT first and then, only once all
   * of it has come back empty, asked again with the forgiving reach
   * (PICK_LENIENT) — so a near miss lands on what it nearly hit instead of
   * clearing the board, and nothing precise is ever taken from a click
   * that did hit something.
   *
   * A SHIFT-CLICK ON NOTHING KEEPS THE SELECTION. Adding one building at
   * a time means missing one now and then, and a miss that emptied the
   * hand would make the gesture unusable.
   */
  private pickAt(p: { x: number; y: number }): void {
    const sim = this.sim;
    const add = this.selAdd;
    // a plain click replaces the selection; a mark on an enemy clears it too
    const replaced = (): void => {
      if (!add) sim.clearStructSelection();
    };
    const ui = sim.unitAt(p.x, p.y);
    if (ui >= 0) {
      replaced();
      sim.setFocusUnit(ui);
      return;
    }
    const si = sim.shieldTowerAt(p.x, p.y);
    if (si >= 0) {
      replaced();
      sim.setFocusShieldTower(si);
      return;
    }
    if (sim.selectStructAt(p.x, p.y, add)) return;
    // NOTHING WAS UNDER THE POINT — so before the click means "clear
    // everything", every question above worth asking again is asked with
    // the forgiving reach. A click that lands a few pixels off a walker in
    // a moving crowd, or a hair outside the turret it meant, is a miss the
    // hand made rather than one the player meant
    if (sim.selectStructAt(p.x, p.y, add, PICK_STRUCT_PAD)) return;
    const lui = sim.unitAt(p.x, p.y, PICK_LENIENT);
    if (lui >= 0) {
      replaced();
      sim.setFocusUnit(lui);
      return;
    }
    if (add) return; // a shift-click on bare ground is not a change of mind
    sim.clearAllSelection();
    sim.clearFocus();
  }

  /** is this world point on the map at all, or out in the void past it? */
  private inWorld(p: { x: number; y: number }): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.worldW && p.y < this.worldH;
  }

  /**
   * The build chain, shared by press and drag:
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
    // is as capable of being stale as an edited map — and applyLevelDoc
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
    window.addEventListener("pointerup", this.onMouseUp);
    window.addEventListener("pointercancel", this.onMouseUp);
    window.addEventListener("wheel", this.onWinWheel, { passive: false });
    uiCanvas.addEventListener("wheel", this.onWheel, { passive: false });
    uiCanvas.addEventListener("pointerdown", this.onMouseDown);
    uiCanvas.addEventListener("pointermove", this.onMove);
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
    window.removeEventListener("pointerup", this.onMouseUp);
    window.removeEventListener("pointercancel", this.onMouseUp);
    window.removeEventListener("wheel", this.onWinWheel);
    this.uiCanvas.removeEventListener("wheel", this.onWheel);
    this.uiCanvas.removeEventListener("pointerdown", this.onMouseDown);
    this.uiCanvas.removeEventListener("pointermove", this.onMove);
    this.uiCanvas.removeEventListener("pointerleave", this.onLeave);
    this.uiCanvas.removeEventListener("contextmenu", this.onContext);
    this.attachMinimap(null);
  }

  setBuildKind(kind: TowerKind | null): void {
    if (kind && this.tech && !this.tech.unlocked.has(kind)) return;
    this.buildKind = kind;
    // a building picked up puts the inspected one down: the ring the hand
    // was reading belongs to a decision it has moved on from
    if (kind) this.sim.clearStructSelection();
  }

  /**
   * THE HAIRLINE DIAGNOSTIC. `?diag=1` on the sandbox door runs it: the
   * next few frames are drawn at a handful of zooms, each frame is read
   * back from the GPU before the browser composites it, and every column
   * and row that is darker than both its neighbours across most of the
   * frame — a seam between tiles, which is what a hairline is — is
   * counted. The report lands in a <pre> over the page, with the GPU's
   * name and the pixel ratio, so it can be screenshotted from a machine
   * whose rendering cannot be seen from here. Dev tooling; not a feature.
   */
  private diagZooms: number[] = [];
  private diagOut: string[] = [];
  private diagZoomWas = 1;
  private diagTlWas: [number, number] = [0, 0];

  diagnose(zooms: number[] = [1, 2.5, 6]): void {
    this.diagZoomWas = this.zoom;
    this.diagTlWas = [this.tlx, this.tly];
    this.diagOut = [
      `build ${BUILD}  gpu ${this.renderer.gpuName()}`,
      `dpr ${window.devicePixelRatio}  canvas ${this.glCanvas.width}x${this.glCanvas.height}  css ${this.glCanvas.clientWidth}x${this.glCanvas.clientHeight}  scale ${this.scale.toFixed(4)}`,
    ];
    this.diagZooms = zooms.slice();
  }

  private diagScan(): void {
    const z = this.diagZooms.shift() ?? 1;
    const w = this.glCanvas.width, h = Math.max(1, this.glCanvas.height - 160);
    const d = this.renderer.readFrame(0, 0, w, h);
    const L = (x: number, y: number): number => {
      const i = ((h - 1 - y) * w + x) * 4;
      return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    };
    // A HAIRLINE PIXEL is one darker than both of its neighbours across
    // it by a clear margin — a dark line one pixel wide, of ANY length.
    // Each one is also placed against the cell grid: the boundaries fall
    // at `phase + k * pitch` device px, so a pixel within one px of one is
    // ON a tile edge, and the share of hairline pixels that are is the
    // whole question — a seam between tiles lives on the grid, and a
    // driver's texture bleed does not care where the grid is
    const pitch = CELL * z * this.scale;
    const onEdge = (p: number, phase: number): boolean => {
      const m = (((p - phase) % pitch) + pitch) % pitch;
      return m <= 1 || pitch - m <= 1;
    };
    const phaseX = (((-this.tlx * z * this.scale) % pitch) + pitch) % pitch;
    const phaseY = (((-this.tly * z * this.scale) % pitch) + pitch) % pitch;
    const DARK = 20;
    let v = 0, vEdge = 0, hz = 0, hEdge = 0;
    // the longest vertical runs of hairline pixels, to say where they are
    const runs: Array<{ x: number; y: number; len: number; lum: number }> = [];
    for (let x = 1; x < w - 1; x++) {
      let run = 0, runY = 0, runLum = 0;
      const edge = onEdge(x, phaseX);
      for (let y = 0; y < h; y++) {
        const l = L(x, y);
        const hair = l < Math.min(L(x - 1, y), L(x + 1, y)) - DARK;
        if (hair) {
          v++;
          if (edge) vEdge++;
          if (!run) { runY = y; runLum = 0; }
          run++;
          runLum += l;
        }
        if ((!hair || y === h - 1) && run) {
          if (run >= 6) runs.push({ x, y: runY, len: run, lum: runLum / run });
          run = 0;
        }
      }
    }
    for (let y = 1; y < h - 1; y++) {
      const edge = onEdge(y, phaseY);
      for (let x = 0; x < w; x++)
        if (L(x, y) < Math.min(L(x, y - 1), L(x, y + 1)) - DARK) {
          hz++;
          if (edge) hEdge++;
        }
    }
    runs.sort((a, b) => b.len - a.len);
    const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)}%` : "-");
    const where = runs
      .slice(0, 6)
      .map((r) => {
        const m = (((r.x - phaseX) % pitch) + pitch) % pitch;
        return `x${r.x} y${r.y} len${r.len} lum${r.lum.toFixed(0)} edge${Math.min(m, pitch - m).toFixed(1)}px`;
      })
      .join("; ");
    this.diagOut.push(
      `zoom ${z}: ${pitch.toFixed(2)} px/cell — hairline px: vertical ${v} (${pct(vEdge, v)} on a cell edge), horizontal ${hz} (${pct(hEdge, hz)} on a cell edge)`,
      `  longest vertical runs: ${where || "none"}`,
    );
    if (this.diagZooms.length) return;
    this.zoom = this.diagZoomWas;
    this.tlx = this.diagTlWas[0];
    this.tly = this.diagTlWas[1];
    const pre = document.createElement("pre");
    pre.id = "diag";
    pre.textContent = this.diagOut.join("\n");
    pre.style.cssText =
      "position:fixed;left:8px;top:80px;z-index:1000;margin:0;padding:8px;background:#000c;color:#fff;font:11px/1.3 monospace;white-space:pre;user-select:text;max-width:calc(100vw - 16px);overflow:auto";
    document.body.appendChild(pre);
    console.log(this.diagOut.join("\n"));
  }

  /** the on-screen menu button — esc, for a screen with no keyboard */
  openMenu(): void {
    if (this.sim.lost() || this.won()) return;
    this.buildKind = null;
    this.menuOpen = true;
  }

  /**
   * ESC MEANS ONE THING: the menu, open or closed. It used to back out a
   * layer at a time — an active build or selection first, the menu only on
   * a bare press — which cost a player two or three presses to reach
   * Resume. A ghost is put away with the right button, which has always
   * cancelled build mode before it demolishes anything, and a selection is
   * dropped by clicking bare ground; neither wants the key that pauses the
   * game.
   */
  toggleMenu(): void {
    if (this.menuOpen) {
      this.menuOpen = false;
      return;
    }
    this.openMenu();
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
    return this.sim.won();
  }

  /** the esc menu's Resume button */
  closeMenu(): void {
    this.menuOpen = false;
  }


  /** fast-forward toggle: any multiplier in SPEEDS; anything else is 1x */
  setSpeed(mult: number): void {
    this.speed = SPEEDS.includes(mult) ? mult : 1;
  }

  /** the Controls tab's pan speed: a multiplier on PAN_RATE, keys and edges alike */
  setPanSpeed(mult: number): void {
    this.panSpeed = Number.isFinite(mult) && mult > 0 ? mult : 1;
  }


  /**
   * The Interface tab's health-bar knobs, both sides at once — they are
   * read straight off the fields every frame (barsOn), so a knob turned
   * from the pause overlay is showing on the field behind it before the
   * panel is even closed.
   */
  setHealthBars(ally: HealthBarMode, enemy: HealthBarMode): void {
    this.allyBars = ally;
    this.enemyBars = enemy;
  }

  /**
   * THE MINIMAP'S CANVAS, or null to let go of it. React owns the element
   * and hands it over when the game screen mounts; the game paints it
   * every frame (drawMinimap) and listens on it for the press and the
   * drag that steer the view (onMmDown). Detaching removes the listeners
   * and drops the painted layers, so a canvas that comes back — the same
   * element or a fresh one — is painted from scratch.
   */
  attachMinimap(canvas: HTMLCanvasElement | null): void {
    const old = this.mmCanvas;
    if (old === canvas) return;
    if (old) {
      old.removeEventListener("pointerdown", this.onMmDown);
      old.removeEventListener("pointermove", this.onMmMove);
      old.removeEventListener("pointerup", this.onMmUp);
      old.removeEventListener("pointercancel", this.onMmUp);
      old.removeEventListener("contextmenu", this.onContext);
    }
    this.mmCanvas = canvas;
    this.mmDrag = false;
    if (canvas) {
      canvas.addEventListener("pointerdown", this.onMmDown);
      canvas.addEventListener("pointermove", this.onMmMove);
      canvas.addEventListener("pointerup", this.onMmUp);
      canvas.addEventListener("pointercancel", this.onMmUp);
      canvas.addEventListener("contextmenu", this.onContext);
    }
  }

  /** put the world point at the centre of the view (the minimap's press) */
  private lookAt(wx: number, wy: number): void {
    this.tlx = wx - this.visW() / 2;
    this.tly = wy - this.visH() / 2;
    this.clampCamera();
  }

  /** a minimap pointer event -> the world point under it -> the view centred there */
  private lookAtMinimap(e: PointerEvent): void {
    const mm = this.mmCanvas;
    if (!mm) return;
    const r = mm.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const fx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const fy = clamp((e.clientY - r.top) / r.height, 0, 1);
    this.lookAt(fx * this.worldW, fy * this.worldH);
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
      elapsed: this.sim.time,
      currentWave: this.sim.currentWave(),
      totalWaves: this.sim.totalWaves,
      buildKind: this.buildKind,
      paused: this.paused,
      speed: this.speed,
      showRoutes: this.showRoutes,
      lost: this.sim.lost(),
      coreHp: Math.ceil(this.sim.core.hp),
      coreHpMax: this.sim.core.hpMax,
      won: this.won(),
      mission: this.sim.level.mission,
      timeLeft: Math.max(0, this.sim.deadline - this.sim.time),
      kills: this.sim.kills,
      menuOpen: this.menuOpen,
      scrap: this.sim.charging ? Math.floor(this.sim.scrap) : null,
      scrapEarned: Math.floor(this.sim.scrapEarned),
      wavesCleared: this.sim.wavesCleared(),
      xp: missionXp(this.sim.wavesCleared(), this.sim.totalWaves),
      prices: PRICES(),
      refunds: REFUNDS(),
      counts: this.sim.towerCounts(),
      unlocked: this.tech ? Array.from(this.tech.unlocked) : null,
      // off the sim's live stats (statsFor), never the static table: the
      // whole point of deriving the line is that an upgrade moves it
      targeting: Object.fromEntries(
        TOWER_KINDS.map((k) => [k, targetingLine(this.sim.statsFor(k))]),
      ) as Record<TowerKind, string>,
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
    this.mmBase = null; // ...and a new ground under the minimap
    this.menuOpen = false;
    this.fitToMap();
    this.renderer.rebuildTerrain(this.sim);
  }

  stats(): Stats {
    return {
      units: this.sim.n,
      kills: this.sim.kills,
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

  /** re-read the loaded map's size, refit the camera to it, and open on
   *  the core (START_ZOOM) */
  private fitToMap(): void {
    this.worldH = this.sim.terrain.rows * CELL;
    this.worldW = this.sim.terrain.cols * CELL;
    this.resize();
    this.zoom = clamp(START_ZOOM, this.minZoom(), ZOOM_MAX);
    this.lookAt(this.sim.core.x, this.sim.core.y);
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
    const dpr = window.devicePixelRatio || 1;
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

    // keyboard pan: PAN_RATE of a viewport per second, times the setting
    const panStep = PAN_RATE * this.panSpeed * dt;
    let panX = 0, panY = 0;
    for (const code of this.keysDown) {
      const dir = PAN_KEYS[code];
      panX += dir[0];
      panY += dir[1];
    }
    if (panX !== 0 || panY !== 0) {
      this.tlx += Math.sign(panX) * this.visW() * panStep;
      this.tly += Math.sign(panY) * this.visH() * panStep;
      this.clampCamera();
    }

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

    if (this.diagZooms.length) {
      // each scan looks at the middle of the map, not wherever the camera
      // happened to be — the spawn corner at a close zoom is mostly void
      this.zoom = this.diagZooms[0];
      const k = this.scale * this.zoom;
      this.tlx = (this.worldW - this.glCanvas.width / k) / 2;
      this.tly = (this.worldH - this.glCanvas.height / k) / 2;
    }
    this.renderer.render(
      this.sim,
      this.zoom,
      -this.tlx * this.zoom,
      -this.tly * this.zoom,
      this.scale,
    );
    if (this.diagZooms.length) this.diagScan();
    this.drawOverlay();
    this.drawMinimap();

    this.fpsEma += (1 / Math.max(dt, 1e-4) - this.fpsEma) * 0.05;
    this.simEma += (simMs - this.simEma) * 0.1;
    this.raf = requestAnimationFrame(this.frame);
  };

  /**
   * Paint the Hydrophobic mask onto a COLS x ROWS bitmap — ONLY where a
   * turret could actually stand, which is open ground (the first test
   * canPlace makes: not blocked — shallows included, deep water not). The
   * mask itself covers the hills and the deep as well, and lighting those
   * would be telling the player about ground they can never build on in
   * the first place.
   *
   * Periwinkle, the same blue the codex draws a special rule in
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
    const { blocked } = this.sim.terrain;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || blocked[i]) continue;
      const p = i * 4;
      img.data[p] = 0x8a;
      img.data[p + 1] = 0xa2;
      img.data[p + 2] = 0xff;
      img.data[p + 3] = 255;
    }
    cc.putImageData(img, 0, 0);
    return cv;
  }

  /**
   * THE MINIMAP: the whole map, never zoomed, with everything the field
   * knows drawn over the ground at a cell a dot —
   *
   *   the PLAYER'S EVERYTHING white — the core, every turret and wall
   *   (a shell still going up in a dimmer white) and every body of
   *   theirs, wherever it is;
   *   the ENEMY red — every body in sight (and none out of it: the
   *   minimap keeps the fog's promise), and the map's shield towers
   *   wherever they have once been seen, a building being a thing that
   *   stays put;
   *   the VIEWPORT as a white frame, which a press or a drag on the map
   *   moves (onMmDown).
   *
   * Two layers: the ground, painted once per map (paintThumb), and one
   * image rebuilt every frame with the rest, both blown up to MM_SCALE
   * with no smoothing so a dot stays a square. Only the GROUND is at the
   * map's true scale: bodies and structures are dilated to a readable
   * square (MM_UNIT_PX, MM_STRUCT_PX), because at a cell a pixel shrunk
   * into the corner a body is a fraction of a screen pixel and reads as
   * nothing at all. Skipped entirely while
   * React has not handed a canvas over (attachMinimap).
   */
  private drawMinimap(): void {
    const mm = this.mmCanvas;
    if (!mm) return;
    const T = this.sim.terrain;
    const cols = T.cols, rows = T.rows;
    const w = cols * MM_SCALE, h = rows * MM_SCALE;
    if (mm.width !== w || mm.height !== h) {
      mm.width = w;
      mm.height = h;
    }
    const c = mm.getContext("2d");
    if (!c) return;
    if (!this.mmBase) {
      this.mmBase = document.createElement("canvas");
      paintThumb(T, rows, this.mmBase);
    }
    if (!this.mmLayer) {
      this.mmLayer = document.createElement("canvas");
      this.mmLayer.width = cols;
      this.mmLayer.height = rows;
    }
    const lc = this.mmLayer.getContext("2d");
    if (!lc) return;
    // the layer is repainted whole every frame, so the buffer is reused
    // and cleared rather than re-allocated (see mmPixels)
    let img = this.mmPixels;
    if (!img || img.width !== cols || img.height !== rows)
      img = this.mmPixels = lc.createImageData(cols, rows);
    const d = img.data;
    d.fill(0);
    const dot = (x: number, y: number, r: number, g: number, b: number): void => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      const o = (y * cols + x) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    };
    const box = (gx: number, gy: number, sz: number, r: number, g: number, b: number): void => {
      for (let y = gy; y < gy + sz; y++) for (let x = gx; x < gx + sz; x++) dot(x, y, r, g, b);
    };
    // HOW MANY CELLS A MARK SPANS so that it reads at MM_*_PX on screen
    // (see those). The CSS width is measured rarely and kept, and the
    // fallback while it is unknown is the backing store's own width,
    // which asks for no dilation at all
    if (this.mmCssTick-- <= 0) {
      this.mmCssTick = MM_CSS_EVERY;
      this.mmCssW = mm.clientWidth || w;
    }
    const perCell = (this.mmCssW || w) / cols;
    const unitSz = Math.max(1, Math.round(MM_UNIT_PX / perCell));
    const structSz = Math.max(1, Math.round(MM_STRUCT_PX / perCell));
    /** a structure's mark: its own footprint, grown to structSz if that is
     *  bigger, and kept centred on the footprint either way */
    const struct = (gx: number, gy: number, sz: number, r: number, g: number, b: number): void => {
      const s = Math.max(sz, structSz), off = (s - sz) >> 1;
      box(gx - off, gy - off, s, r, g, b);
    };
    // the swarm red, and everything of ours white, so the map answers
    // "us or them" at a glance
    // instead of asking for three colours to be told apart at a pixel each
    const { upx, upy, n } = this.sim;
    const uoff = (unitSz - 1) >> 1;
    for (let i = 0; i < n; i++) {
      const gx = (upx[i] / CELL) | 0, gy = (upy[i] / CELL) | 0;
      box(gx - uoff, gy - uoff, unitSz, 0xf2, 0x55, 0x55);
    }
    // the map's shield towers, wherever they have been seen
    for (const s of this.sim.shieldTowers) {
      if (s.hp <= 0) continue;
      struct(s.gx, s.gy, SHIELD_TOWER_SIZE, 0xf2, 0x55, 0x55);
    }
    // ...and the player's, over everything: the line is what the map is read for
    for (const t of this.sim.towers) {
      const v = t.buildT > 0 ? 0x9a : 0xff;
      struct(t.gx, t.gy, structStats(t.kind).size, v, v, v);
    }
    struct(T.base.x, T.base.y, T.base.size, 0xff, 0xff, 0xff);
    lc.putImageData(img, 0, 0);

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.mmBase, 0, 0, cols, rows, 0, 0, w, h);
    c.drawImage(this.mmLayer, 0, 0, cols, rows, 0, 0, w, h);
    // THE VIEWPORT'S FRAME: where on the whole map the screen is looking.
    // Kept inside the minimap (a view run out into the void past the map
    // would otherwise carry its frame off the edge and lose a side), and
    // drawn white over a dark outline so it reads on the pale ground, the
    // dark rock and the white line alike
    const k = MM_SCALE / CELL;
    const fx0 = clamp(this.tlx * k, 1, w - 1), fy0 = clamp(this.tly * k, 1, h - 1);
    const fx1 = clamp((this.tlx + this.visW()) * k, 1, w - 1);
    const fy1 = clamp((this.tly + this.visH()) * k, 1, h - 1);
    c.lineJoin = "miter";
    c.strokeStyle = "rgba(0,0,0,0.8)";
    c.lineWidth = 4;
    c.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    c.strokeStyle = "#ffffff";
    c.lineWidth = 2;
    c.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  }

  /**
   * THE SELECTION MARQUEE while one is being dragged over the board.
   *
   * The RING under a selected body is the renderer's, not this canvas's
   * (Renderer.pushUnitPass) — it is the team's own amber at full strength,
   * so a selection is a mark the board already speaks in — and the health
   * over a body is drawUnitBars', wherever that body came from. What is
   * left here belongs to the HAND rather than to the board.
   */
  private drawSelection(c: CanvasRenderingContext2D): void {
    if (this.selecting && this.selDragPx > SEL_DRAG_PX) {
      const x = Math.min(this.selFrom.x, this.selTo.x), y = Math.min(this.selFrom.y, this.selTo.y);
      const w = Math.abs(this.selTo.x - this.selFrom.x), h = Math.abs(this.selTo.y - this.selFrom.y);
      c.fillStyle = "rgba(255,211,127,0.09)";
      c.fillRect(x, y, w, h);
      c.strokeStyle = SELECT_RING;
      c.lineWidth = 1;
      c.strokeRect(x, y, w, h);
    }
  }


  /**
   * A STACK OF BARS OVER ONE THING ON THE BOARD — the game's only readout
   * for "how far along is this", drawn on the overlay in world space so it
   * scales with the zoom like everything else on the field.
   *
   * A bar is a fraction and a colour. They stack UPWARDS from `topY` in
   * the order given, so the caller's order is the reading order from the
   * body up: hp first (nearest the thing it belongs to, where a player
   * looks for it), then whatever work it is doing above that. Nothing is
   * drawn for an empty list, so a building with nothing to say wears
   * nothing.
   *
   * These replaced the radial ring the shells used to wear. A ring says
   * "something is happening here" and nothing more: it cannot be stacked,
   * two of them cannot be told apart at a glance, and a quarter-full ring
   * and a three-quarter-full one look alike at the zoom this game is
   * played at. A bar is read left to right at any size.
   */
  private drawBars(
    c: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    width: number,
    bars: ReadonlyArray<{ v: number; col: string }>,
  ): void {
    if (bars.length === 0) return;
    const w = Math.max(width, BAR_MIN_W);
    const x = cx - w / 2;
    let y = topY - BAR_GAP;
    for (const b of bars) {
      y -= BAR_H;
      c.fillStyle = BAR_BACK;
      c.fillRect(x, y, w, BAR_H);
      const f = clamp(b.v, 0, 1);
      if (f > 0) {
        c.fillStyle = b.col;
        c.fillRect(x, y, w * f, BAR_H);
      }
      c.strokeStyle = BAR_EDGE;
      c.lineWidth = 0.5;
      c.strokeRect(x, y, w, BAR_H);
      y -= BAR_GAP;
    }
    c.lineWidth = 1;
  }

  /**
   * DOES A BODY ON THIS SIDE WEAR ITS HEALTH RIGHT NOW? The one place the
   * Interface tab's two knobs are read, so a unit, a turret, a wall and
   * the core all answer the question the same way.
   *
   * `hovered` is only ever true for the one body under the cursor, and
   * `selected` is the standing exception to every mode but `never`: a
   * player who has picked a squad or a building out of a board is asking
   * about those, and a hurt one in the picked set says so whatever the
   * field at large is set to. A full-health selection still wears nothing
   * — the amber ring or outline on it is the mark that says it is picked.
   */
  private barsOn(ally: boolean, f: number, hovered: boolean, selected: boolean): boolean {
    const mode = ally ? this.allyBars : this.enemyBars;
    if (mode === "never") return false;
    if (mode === "always") return true;
    if (selected && f < 1) return true;
    return mode === "hover" ? hovered : f < 1;
  }

  /** is either side's knob on `hover`? — the only case that costs a hit test */
  private hoverBars(): boolean {
    return this.allyBars === "hover" || this.enemyBars === "hover";
  }

  /**
   * THE BODY UNDER THE CURSOR, or -1 — what the `hover` mode reads. Both
   * sides, unlike Sim.unitAt, which answers the narrower question of what
   * a press would MARK; a bar is not an order, and a player pointing at a
   * dagger to see how hurt it is means the dagger.
   */
  private hoverUnit(): number {
    if (this.hoverX < 0) return -1;
    const { upx, upy, urad, uhp, n } = this.sim;
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      if (uhp[i] <= 0) continue;
      const dx = upx[i] - this.hoverX, dy = upy[i] - this.hoverY;
      const d2 = dx * dx + dy * dy;
      const r = Math.max(urad[i] * 1.6, HOVER_MIN_R);
      if (d2 < r * r && d2 < bd) {
        bd = d2;
        best = i;
      }
    }
    return best;
  }

  /** is the cursor inside this footprint? — the buildings' half of `hover` */
  private hoverOver(x: number, y: number, size: number): boolean {
    if (this.hoverX < 0) return false;
    const half = size / 2;
    return Math.abs(this.hoverX - x) <= half && Math.abs(this.hoverY - y) <= half;
  }

  /**
   * EVERY BODY'S HEALTH, one bar over each, on whatever terms the
   * Interface tab is set to (barsOn). The player's own run the HUD's
   * green-amber-red ramp; the swarm's are red throughout (ENEMY_HP), so
   * a glance at a melee says which bars belong to which army without
   * reading a single length.
   *
   */
  private drawUnitBars(c: CanvasRenderingContext2D): void {
    if (this.allyBars === "never" && this.enemyBars === "never") return;
    const { upx, upy, urad, uhp, uhpmax, n } = this.sim;
    const hoverI = this.hoverBars() ? this.hoverUnit() : -1;
    const bars: { v: number; col: string }[] = [];
    for (let i = 0; i < n; i++) {
      if (uhp[i] <= 0) continue;
      const f = clamp(uhp[i] / Math.max(1, uhpmax[i]), 0, 1);
      if (!this.barsOn(false, f, i === hoverI, false)) continue;
      bars.length = 0;
      bars.push({ v: f, col: ENEMY_HP });
      const r = Math.max(urad[i] * 1.25, 7);
      this.drawBars(c, upx[i], upy[i] - r, Math.max(r * 2, BAR_MIN_W), bars);
    }
  }

  /**
   * Every structure's bars: what it is making, what is still going up, and
   * what is left of it.
   *
   *   CONSTRUCTION the shell's own timer (Tower.buildT)
   *   HP           on the Interface tab's terms (barsOn), the same terms
   *                a unit's health is on — a wall and a walker are both
   *                things with health standing on the board
   *
   * The swarm's buildings get the same treatment on ground the player has
   * seen, because "how much is left of that bunker" is the same question
   * from either side of it — asked in red, like its units' (ENEMY_HP).
   *
   * THE CORE gets the mining bar too, since it ships on the same clock
   * (Sim.coreMineT) — it is the run's first and largest earner, and a bar
   */
  private drawStructureBars(c: CanvasRenderingContext2D): void {
    const bars: { v: number; col: string }[] = [];
    // A BUILDING IN THE SELECTION COUNTS AS PICKED, exactly as a body in it
    // does (barsOn): asked for only when there is a selection to ask about,
    // since selectedStructs copies the set to answer
    const picked = this.sim.selectedStructN > 0 ? new Set(this.sim.selectedStructs) : null;
    // the core's shipment, and what is left of the thing the whole run is
    // spent defending — one body, both bars, on the player's own terms
    const core = this.sim.core;
    const csz = core.size * CELL;
    bars.length = 0;
    const cf = clamp(core.hp / Math.max(1, core.hpMax), 0, 1);
    if (this.barsOn(true, cf, this.hoverOver(core.x, core.y, csz), picked?.has(core) === true))
      bars.push({ v: cf, col: hpColor(cf) });
    this.drawBars(c, core.x, core.y - csz / 2, csz - 2, bars);
    for (const t of this.sim.towers) {
      const st = structStats(t.kind);
      const sz = st.size * CELL;
      bars.length = 0;
      const hpMax = towerMaxHp(t.kind);
      const f = clamp(t.hp / Math.max(1, hpMax), 0, 1);
      // a shell is on 1 hp by design (Tower.buildT) — that is a state, not
      // a wound, and the construction bar below is already saying it
      if (t.buildT <= 0 && this.barsOn(true, f, this.hoverOver(t.x, t.y, sz), picked?.has(t) === true))
        bars.push({ v: f, col: hpColor(f) });
      if (t.buildT > 0 && t.buildTotal > 0)
        bars.push({ v: 1 - t.buildT / t.buildTotal, col: BAR_BUILD });
      this.drawBars(c, t.x, t.y - sz / 2, sz - 2, bars);
    }
    // THE SWARM'S SHIELD TOWERS (mutation.ts) stand outside the tower list
    // and are buildings all the same. The BODY's health is what a bar can
    // say; the dome over it is the renderer's business and is drawn as
    // what it is, a dome
    const ssz = SHIELD_TOWER_SIZE * CELL;
    for (const s of this.sim.shieldTowers) {
      if (s.hp <= 0) continue;
      const f = clamp(s.hp / Math.max(1, s.hpMax), 0, 1);
      if (!this.barsOn(false, f, this.hoverOver(s.x, s.y, ssz), false)) continue;
      this.drawBars(c, s.x, s.y - ssz / 2, ssz - 2, [{ v: f, col: ENEMY_HP }]);
    }
  }

  private drawOverlay(): void {
    const c = this.uictx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    // world-space transform through the camera
    const s = this.scale * this.zoom;
    c.setTransform(s, 0, 0, s, -this.tlx * s, -this.tly * s);

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
        const p = r.pts;
        if (p.length < 4) continue;
        const col = zoneStyle(r.zone).css;
        c.strokeStyle = col;
        c.globalAlpha = 0.5;
        c.lineWidth = 2;
        c.setLineDash([10, 8]);
        c.beginPath();
        c.moveTo(p[0], p[1]);
        for (let k = 2; k < p.length; k += 2) c.lineTo(p[k], p[k + 1]);
        c.stroke();
        c.setLineDash([]);
        // the arrowhead settles which end is the destination, and it lies
        // along the LAST leg — the route is a curve now, so the heading of
        // the whole line is not the heading it arrives on
        const ex = p[p.length - 2], ey = p[p.length - 1];
        const a = Math.atan2(ey - p[p.length - 3], ex - p[p.length - 4]);
        const hx = ex - Math.cos(a) * 14, hy = ey - Math.sin(a) * 14;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.moveTo(ex, ey);
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

    // THE SELECTED BUILDINGS: a footprint outline on every one of them, a
    // range ring on the ones that have a range. The sim drops a building from
    // the selection as it leaves the board (removeTower), so nothing here
    // can be drawn over bare ground
    for (const st of this.sim.selectedStructs) {
      const size = isCore(st) ? st.size : structStats(st.kind).size;
      if (!isCore(st)) {
        // the LIVE range, not the table's: an upgrade branch that lengthened
        // this turret's reach has to move the ring it is drawn with, or the
        // ring becomes a lie about what the turret can shoot (Sim.statsFor)
        const range = this.sim.statsFor(st.kind as TowerKind).range;
        if (range > 0) {
          c.beginPath();
          c.arc(st.x, st.y, range, 0, Math.PI * 2);
          c.fillStyle = "rgba(255,211,127,0.06)";
          c.fill();
          c.strokeStyle = "rgba(255,211,127,0.7)";
          c.lineWidth = 1.5;
          c.stroke();
        }
      }
      c.strokeStyle = "rgba(255,211,127,0.7)";
      c.lineWidth = 1.5;
      const selPx = size * CELL;
      c.strokeRect(st.gx * CELL + 1, st.gy * CELL + 1, selPx - 2, selPx - 2);
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
    }

    // WHAT EVERY STRUCTURE IS DOING, as a stack of bars over it (drawBars)
    this.drawStructureBars(c);
    // ...and what every BODY has left, on the Interface tab's terms
    this.drawUnitBars(c);
    // ...and the rectangle being dragged over the board right now
    this.drawSelection(c);

    if (this.buildKind && this.hoverGx >= 0 && !this.panning) {
      // ONE GHOST, OR THE WHOLE RULER LINE. A shift-drag is aiming a run of
      // buildings that will land all at once on release, so all of it is
      // drawn — each one asking canPlace for itself, so the line shows
      // exactly which of them the ground will take
      const cells =
        this.ruler && this.building
          ? this.sim.rulerCells(this.rulerFrom.x, this.rulerFrom.y, this.hoverX, this.hoverY, this.buildKind)
          : [{ gx: this.hoverGx, gy: this.hoverGy }];
      for (const cell of cells) this.drawGhost(c, cell.gx, cell.gy, this.buildKind);
    }
  }

  /** one placement ghost: the footprint, tinted by what the ground says */
  private drawGhost(c: CanvasRenderingContext2D, gx: number, gy: number, kind: TowerKind): void {
    // red marks anything that blocks the spot: walls, the base, units
    // underneath, or a placement that would seal the swarm's last route
    const sz = TOWERS[kind].size;
    const px = sz * CELL;
    const ok = this.sim.canPlace(gx, gy, kind);
    const x = gx * CELL, y = gy * CELL;
    // a legal spot that the Hydrophobic rule TAXES is drawn in the
    // special rule's own blue rather than the ordinary amber: the
    // placement is allowed, so it must not read as refused, but most of
    // a turret's damage is worth a colour of its own
    const soaked = ok && this.sim.isWaterlogged(gx, gy, kind);
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
