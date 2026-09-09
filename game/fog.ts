import { clamp, CELL, COLS, NCELLS, ROWS } from "./constants";

/**
 * FOG OF WAR — Mindustry's own, ported whole from mindustry.game.FogControl
 * and mindustry.graphics.FogRenderer (the drawing half lives in
 * renderer.ts, drawFog).
 *
 * TWO SETS OF BITS, NOT THREE STATES. Upstream keeps a FogData per team
 * and this game has one team that owns a fog, so there is one of each:
 *
 *   discovered  FogData.staticData — every cell an eye has EVER stood
 *               within reach of. It only ever grows, and nothing but a
 *               new map clears it. Ground on it keeps its terrain and the
 *               player's memory of what was built there.
 *   visible     FogData.read — the cells an eye covers RIGHT NOW. Rebuilt
 *               from nothing each time, and a cell that drops out of it
 *               takes the swarm standing on it with it.
 *
 * They are independent, exactly as upstream's are, and `visible` is NOT a
 * subset of `discovered`: the dynamic raster is drawn one tile wider than
 * the static one (`rad + 1` in updateDynamic, "always +1 to keep up with
 * visuals"), because the picture the renderer draws is a polygon at the
 * eye's true floating position and can reach a tile past the integer
 * circle the rules are made of. The rules being the more generous of the
 * two is the safe way round: nothing is ever shown that cannot be shot.
 *
 * THE DOUBLE BUFFER (read / write) is upstream's, and it is kept: a
 * rebuild fills `write` from empty and trades it for `read` in one
 * assignment at the end, so anything reading the fog mid-rebuild reads
 * the last finished one rather than a half-drawn one. Upstream needs that
 * because its rebuild is on its own thread; here it costs one pointer
 * swap and buys the same guarantee for a caller that holds the array
 * across a loop.
 *
 * THE RASTER IS A MIDPOINT CIRCLE (`circle`, `hline`) — integer centre,
 * integer radius, filled by horizontal spans. Not a distance test per
 * cell: this is the Bresenham circle FogControl uses, span for span, so a
 * cell either side of the rim falls on the same side of it here as it
 * does upstream.
 *
 * WHEN IT IS REBUILT. The dynamic set is rebuilt at most 25 times a
 * second (FOG_DYNAMIC_INTERVAL, upstream's dynamicUpdateInterval), and
 * only when something has actually moved: `dynamicUpdated` is raised when
 * a building with an eye goes up, finishes or comes down, and when a unit
 * carrying one steps onto a new TILE. A field of units standing still
 * costs nothing at all.
 *
 * THE STATIC SET IS EVENT-DRIVEN, never rebuilt. Every eye that appears
 * or moves to a new tile pushes one event (`pushEvent`), and an event is
 * a circle stamped into `discovered` and handed to the renderer to stamp
 * into its own accumulating buffer. That is why a unit walking fast still
 * leaves an unbroken discovered trail: it stamps on every tile it crosses,
 * not on the 25Hz sample points.
 *
 * NOTHING STOPS SIGHT — no line of sight, no shadowing, exactly as
 * upstream: a fog radius is a radius. Whether a turret can SHOOT what the
 * fog shows it is a separate question and still Sim.hasSight's, which
 * does stop at rock.
 */

/**
 * WHAT A FINISHED TURRET SEES, as a share of its range: the whole of it,
 * which is Mindustry's own rule (Turret.fogRadiusMultiplier is 1).
 *
 * It was three quarters, so that a lone gun shot past what it could see
 * and a gun in a line shot the whole way because its neighbours were
 * looking for it. On the board that reads as the position being half
 * blind rather than as anything to build around: what a player has paid
 * for and put on the ground should light the ground it is standing on.
 */
export const VISION_OF_RANGE = 1;
/**
 * What a FINISHED structure with no range of its own sees — a wall, a
 * drill, a factory — in tiles. It was three, which is the building's own
 * footprint and little else: a drill out in the field lit nothing, not
 * even the patch it was standing on, and a wall was not an eye so much as
 * a rumour. Everything the player owns sees SOMETHING now.
 */
export const VISION_BUILT_CELLS = 12;
/**
 * What a shell still going up sees, in tiles: its own ground and no more.
 * A ghost is not an eye — a chain of cheap walls dragged out into the
 * black would otherwise buy the whole map a few tiles at a time without
 * one of them ever being finished or paid for.
 */
export const VISION_BUILDING_CELLS = 3;
/**
 * What the core sees, in tiles — far more than any turret. The core is
 * the eye of the position: a run opens with the ground the player will
 * build on already lit, out to about the width of the starting view, and
 * the rest of the map (512 tiles across) still dark.
 */
export const CORE_VISION_CELLS = 34;
/**
 * WHAT THE BRIEFING HAS ALREADY SEEN, in tiles: the patch of ground round
 * each of a mission's targets (levels.ts MissionTarget) that a run opens
 * with already DISCOVERED — stamped into the static set and nowhere near
 * the dynamic one, so the pad and the ground it stands on are drawn in the
 * grey of remembered ground, from the first frame, with nothing live on
 * them. A player knows where the pads are the way an intelligence briefing
 * knows: the building is on the map, and what is standing guard around it
 * is not.
 *
 * Fourteen tiles is a little over the pad's own footprint either side —
 * enough that the pad reads as a place rather than as a sprite floating in
 * the black, and nowhere near enough to scout the approach with.
 */
export const MISSION_INTEL_CELLS = 14;

/**
 * FogControl.dynamicUpdateInterval, 1000/25 ms — in SECONDS of simulated
 * time rather than wall clock. Upstream measures this with Time.millis
 * because its fog lives on its own thread; ours runs inside the tick, and
 * a run that is paused, fast-forwarded or replayed headless has to see
 * the same fog either way, so it is the sim's clock that drives it.
 */
export const FOG_DYNAMIC_INTERVAL = 1 / 25;
/** Rules.dynamicColor's alpha: the wash over discovered, unwatched ground */
export const FOG_DYNAMIC_ALPHA = 0.5;
/** Rules.staticColor's alpha: undiscovered ground is flat black */
export const FOG_STATIC_ALPHA = 1;

export interface VisionSource {
  /** world px — the true position, which is what the renderer draws at */
  x: number;
  y: number;
  /** world px — the true radius, which is what the renderer draws */
  r: number;
  /**
   * ...and the same radius in TILES, as the raster takes it. Upstream
   * rounds a building's (Mathf.round(build.fogRadius())) and truncates a
   * unit's ((int)unit.type.fogRadius), so the caller says which it is by
   * handing over the integer it wants.
   */
  tiles: number;
}

/** one static event, packed the way FogEvent packs it: x, y, radius */
type StaticEvents = number[];

/** how many numbers the renderer's queue may hold before it stops taking
 *  more — thirty thousand stamps, which no frame has ever owed */
const DRAW_EVENT_CAP = 90000;

export class Fog {
  /** FogData.read — 1 on every tile an eye covers right now */
  visible = new Uint8Array(NCELLS);
  /** FogData.write — the back buffer a rebuild draws into */
  private back = new Uint8Array(NCELLS);
  /** FogData.staticData — 1 on every tile ever discovered */
  readonly discovered = new Uint8Array(NCELLS);
  /**
   * bumps on every change to either set — the minimap repaints its wash
   * and the no-framebuffer fallback re-uploads its texture only when this
   * moves
   */
  version = 1;
  /**
   * bumps when the fog starts over on a new map — the renderer's static
   * buffer is a texture it accumulates frame by frame, and this is the
   * only thing that tells it to wipe (FogRenderer's clearStatic).
   */
  epoch = 1;
  /**
   * OFF means everything is visible, always: the title screen's field and
   * the headless balance bot play without fog, and both read these arrays
   * the same way the game does — they are simply all 1 there. Upstream's
   * own escape hatch is the same shape (team.isAI(), which returns true
   * from every query).
   */
  enabled = true;
  /** FogData.dynamicUpdated: something moved, so a rebuild is owed */
  private dynamicUpdated = true;
  /** FogData.lastDynamicMs, in sim seconds */
  private lastDynamic = 0;
  /** FogControl.justLoaded: the first update after a new map ignores the
   *  interval, so a run does not open on a frame of pop-in */
  private justLoaded = true;
  /** FogControl.staticEvents — waiting to be stamped into `discovered` */
  private events: StaticEvents = [];
  /**
   * ...and FogRenderer.events, waiting for its accumulating buffer.
   *
   * QUEUED FROM THE FIRST EVENT, before any renderer exists — which is
   * the point. The seed a new map lays down (Sim.seedFog, upstream's
   * pushStaticBlocks on WorldLoadEvent) happens while the sim is being
   * built, frames before a renderer asks for anything, and those stamps
   * are the ground the run opens on: drop them and the player starts on a
   * map that is lit but not remembered. Upstream keeps them by rebuilding
   * the renderer's buffer from the CPU bits instead (copyFromCpu); this
   * keeps them by simply not throwing them away.
   *
   * `wantsDrawEvents` only ever goes FALSE, and only once a renderer has
   * said it cannot use them (a driver with no framebuffer, on the cell
   * fallback). The cap below is the backstop for a fog that is on with
   * nothing drawing it at all: the queue stops growing rather than
   * growing without end, and nothing that would have read it exists.
   */
  private drawEvents: StaticEvents = [];
  private spare: StaticEvents = [];
  /** FogControl.pushEvent's `!headless`: is a FogRenderer taking these? */
  wantsDrawEvents = true;

  /**
   * The smallest rectangle covering every tile that has changed since the
   * fallback renderer last took it (takeDirty): x0,y0,x1,y1 inclusive,
   * empty when x1 < x0.
   */
  private dx0 = 0;
  private dy0 = 0;
  private dx1 = -1;
  private dy1 = -1;
  /** the rectangle the last dynamic rebuild lit, which the next one clears */
  private lx0 = 0;
  private ly0 = 0;
  private lx1 = -1;
  private ly1 = -1;

  /** a new map: nothing seen, nothing discovered (WorldLoadEvent) */
  reset(enabled: boolean): void {
    this.enabled = enabled;
    this.epoch++;
    const v = enabled ? 0 : 1;
    this.visible.fill(v);
    this.back.fill(0);
    this.discovered.fill(v);
    this.events.length = 0;
    this.drawEvents.length = 0;
    this.dynamicUpdated = true;
    this.justLoaded = true;
    this.lastDynamic = 0;
    this.lx1 = -1;
    this.lx0 = 0;
    this.markAll();
    this.version++;
  }

  // ── what the rest of the game asks the fog ────────────────────────────

  /**
   * FogControl.isVisibleTile: is this tile covered right now? A query off
   * the map CLAMPS to the nearest tile rather than answering no, which is
   * upstream's rule — a body half a tile past the border is not suddenly
   * invisible.
   */
  isVisible(gx: number, gy: number): boolean {
    if (!this.enabled) return true;
    return this.visible[clamp(gx, 0, COLS - 1) + clamp(gy, 0, ROWS - 1) * COLS] !== 0;
  }

  /** FogControl.isVisible: the same question at a world point */
  visibleAt(px: number, py: number): boolean {
    return this.isVisible(Math.floor(px / CELL), Math.floor(py / CELL));
  }

  /**
   * FogControl.isDiscovered: has this world point ever been seen? (a
   * remembered structure is drawn here). Off the map is NOT discovered —
   * upstream bounds-checks this one rather than clamping it.
   */
  seenAt(px: number, py: number): boolean {
    const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
    if (!this.enabled) return true;
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return false;
    return this.discovered[gy * COLS + gx] !== 0;
  }

  // ── what tells the fog something happened ─────────────────────────────

  /**
   * FogControl's TileChangeEvent: a building with an eye went up, or
   * finished and grew. It stamps the static set at once and asks for a
   * dynamic rebuild; upstream does exactly this and no more, which is why
   * a turret placed into the dark lights its own ground on the frame it
   * lands.
   */
  add(src: VisionSource): void {
    if (!this.enabled) return;
    this.dynamicUpdated = true;
    this.pushEvent(Math.floor(src.x / CELL), Math.floor(src.y / CELL), src.tiles);
  }

  /**
   * FogControl's TilePreChangeEvent: a building with an eye is going. The
   * static set keeps what it saw — discovery is never undone — and the
   * dynamic set is rebuilt without it.
   */
  invalidate(): void {
    if (this.enabled) this.dynamicUpdated = true;
  }

  /**
   * A moving eye stepped onto a new tile (FogControl.update's
   * `unit.lastFogPos != pos` branch): one static stamp where it now
   * stands, and a dynamic rebuild owed. The caller owns the "has it
   * moved" test, because upstream keeps that state on the unit.
   */
  moved(gx: number, gy: number, tiles: number): void {
    if (!this.enabled) return;
    this.dynamicUpdated = true;
    this.pushEvent(gx, gy, tiles);
  }

  /** FogControl.pushEvent: into the raster's queue, and into the renderer's */
  private pushEvent(gx: number, gy: number, tiles: number): void {
    if (tiles <= 0) return;
    this.events.push(gx, gy, tiles);
    if (this.wantsDrawEvents && this.drawEvents.length < DRAW_EVENT_CAP)
      this.drawEvents.push(gx, gy, tiles);
  }

  /**
   * FogControl.update, for the one team that has a fog: stamp whatever
   * static events have piled up, and rebuild the dynamic set if something
   * moved and it is time. `time` is Sim.time, in seconds.
   */
  update(sources: () => readonly VisionSource[], time: number): void {
    if (!this.enabled) return;
    if (this.events.length > 0) this.updateStatic();
    if (!this.dynamicUpdated) return;
    if (!this.justLoaded && time - this.lastDynamic <= FOG_DYNAMIC_INTERVAL) return;
    this.justLoaded = false;
    this.dynamicUpdated = false;
    this.lastDynamic = time;
    this.updateDynamic(sources());
  }

  /** FogControl.updateStatic: drain the queue into `discovered` */
  private updateStatic(): void {
    const e = this.events;
    for (let i = 0; i < e.length; i += 3) this.circle(this.discovered, e[i], e[i + 1], e[i + 2]);
    e.length = 0;
    this.version++;
  }

  /**
   * FogControl.updateDynamic: clear the back buffer, stamp every eye into
   * it at radius + 1, and swap it in.
   */
  private updateDynamic(sources: readonly VisionSource[]): void {
    const w = this.back;
    // the ground closing behind an eye changed as much as the ground
    // opening in front of it, so the last rebuild's whole footprint is dirty
    if (this.lx1 >= this.lx0) this.mark(this.lx0, this.ly0, this.lx1, this.ly1);
    this.lx1 = -1;
    this.lx0 = 0;
    w.fill(0);
    for (const src of sources) {
      if (src.tiles <= 0) continue;
      // "radius is always +1 to keep up with visuals" — the drawn circle
      // is a polygon at a floating position and reaches further than the
      // integer one, so the rules are widened rather than the picture
      // narrowed
      const x = Math.floor(src.x / CELL), y = Math.floor(src.y / CELL);
      this.circle(w, x, y, src.tiles + 1);
      this.lit(x, y, src.tiles + 1);
    }
    // the swap step: one assignment, and every reader is on the finished set
    const prev = this.visible;
    this.visible = w;
    this.back = prev;
    this.version++;
  }

  /** what the renderer's accumulating static buffer still owes; asking clears it */
  takeStaticEvents(): readonly number[] {
    const e = this.drawEvents;
    this.drawEvents = this.spare;
    this.drawEvents.length = 0;
    this.spare = e;
    return e;
  }

  /**
   * What has changed since this was last asked, as a tile rectangle — the
   * fallback renderer's upload window. Asking clears it, so two readers
   * cannot both be served; there is one (Renderer.drawFogCells).
   */
  takeDirty(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (this.dx1 < this.dx0) return null;
    const r = { x0: this.dx0, y0: this.dy0, x1: this.dx1, y1: this.dy1 };
    this.dx1 = -1;
    this.dx0 = 0;
    return r;
  }

  // ── the raster: FogControl.circle and FogControl.hline, span for span ──

  /**
   * The midpoint circle, filled. This is FogControl.circle exactly — the
   * same decision variable, the same eight spans a step — so a tile is on
   * the lit side of the rim here if and only if it is upstream.
   */
  private circle(arr: Uint8Array, x: number, y: number, radius: number): void {
    this.markBox(x, y, radius);
    let f = 1 - radius;
    let ddFx = 1, ddFy = -2 * radius;
    let px = 0, py = radius;

    this.hline(arr, x, x, y + radius);
    this.hline(arr, x, x, y - radius);
    this.hline(arr, x - radius, x + radius, y);

    while (px < py) {
      if (f >= 0) {
        py--;
        ddFy += 2;
        f += ddFy;
      }
      px++;
      ddFx += 2;
      f += ddFx;
      this.hline(arr, x - px, x + px, y + py);
      this.hline(arr, x - px, x + px, y - py);
      this.hline(arr, x - py, x + py, y + px);
      this.hline(arr, x - py, x + py, y - px);
    }
  }

  /** FogControl.hline: one span, clipped to the map */
  private hline(arr: Uint8Array, x1: number, x2: number, y: number): void {
    if (y < 0 || y >= ROWS) return;
    if (x1 > x2) {
      const tmp = x1;
      x1 = x2;
      x2 = tmp;
    }
    if (x1 >= COLS) return;
    if (x2 < 0) return;
    if (x1 < 0) x1 = 0;
    if (x2 >= COLS) x2 = COLS - 1;
    x2++;
    const off = y * COLS;
    arr.fill(1, off + x1, off + x2);
  }

  // ── the dirty rectangle, which is ours: upstream re-uploads everything ─

  /** the whole map has changed under the renderer */
  private markAll(): void {
    this.dx0 = 0;
    this.dy0 = 0;
    this.dx1 = COLS - 1;
    this.dy1 = ROWS - 1;
  }

  /** grow the dirty rectangle over a tile range */
  private mark(x0: number, y0: number, x1: number, y1: number): void {
    if (this.dx1 < this.dx0) {
      this.dx0 = x0;
      this.dy0 = y0;
      this.dx1 = x1;
      this.dy1 = y1;
      return;
    }
    if (x0 < this.dx0) this.dx0 = x0;
    if (y0 < this.dy0) this.dy0 = y0;
    if (x1 > this.dx1) this.dx1 = x1;
    if (y1 > this.dy1) this.dy1 = y1;
  }

  /** one circle's bounding box, into the dirty rectangle */
  private markBox(x: number, y: number, radius: number): void {
    const x0 = Math.max(0, x - radius), x1 = Math.min(COLS - 1, x + radius);
    const y0 = Math.max(0, y - radius), y1 = Math.min(ROWS - 1, y + radius);
    if (x1 >= x0 && y1 >= y0) this.mark(x0, y0, x1, y1);
  }

  /** ...and into the rectangle the DYNAMIC set now covers, which is what
   *  the next rebuild has to dirty when it clears it again */
  private lit(x: number, y: number, radius: number): void {
    const x0 = Math.max(0, x - radius), x1 = Math.min(COLS - 1, x + radius);
    const y0 = Math.max(0, y - radius), y1 = Math.min(ROWS - 1, y + radius);
    if (x1 < x0 || y1 < y0) return;
    if (this.lx1 < this.lx0) {
      this.lx0 = x0;
      this.ly0 = y0;
      this.lx1 = x1;
      this.ly1 = y1;
      return;
    }
    if (x0 < this.lx0) this.lx0 = x0;
    if (y0 < this.ly0) this.ly0 = y0;
    if (x1 > this.lx1) this.lx1 = x1;
    if (y1 > this.ly1) this.ly1 = y1;
  }
}
