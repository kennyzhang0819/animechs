import { CELL, clamp, COLS, NCELLS, ROWS } from "./constants";

/**
 * FOG OF WAR — what the player can see of the map, one byte a cell.
 *
 * Three layers, StarCraft's three:
 *
 *   FOG_NEVER    never discovered — drawn black. Nothing on it is drawn
 *                or targetable, and nothing may be built on it.
 *   FOG_SEEN     seen once, out of sight now — the ground stays, drawn
 *                under a half-black wash (FOG_SEEN_ALPHA), and the enemy
 *                on it is as hidden as on never-seen ground: a body that
 *                walks into the grey is gone until something sees it again.
 *   FOG_VISIBLE  in sight right now — clear, targetable, buildable.
 *
 * WHAT SEES: the player's structures, and nothing else — there are no
 * player units in this game. The core sees CORE_VISION cells; a turret
 * sees VISION_OF_RANGE of its own range (Mindustry gives a turret the
 * whole of it — Turret.fogRadiusMultiplier is 1 — and StarCraft's static
 * defence sees FURTHER than it shoots; this game wants the gap the other
 * way, so a lone turret shoots at three quarters of its reach and a
 * turret in a line shoots at the whole of it, because its neighbours are
 * looking for it); a wall, or a shell still going up, sees a few cells
 * round itself (VISION_MIN_CELLS) — enough to watch what is chewing it.
 *
 * NOTHING STOPS SIGHT. A source reveals its whole circle — rock, the
 * ground behind rock, everything inside the radius — so a turret watches
 * over a ridge as readily as across open floor and a hill is never a
 * black bite out of what the player has lit. The fog says how far the
 * line reaches, not what stands in the way of it; whether a turret can
 * SHOOT what it sees is a separate question and still Sim.hasSight's,
 * which does stop at rock. A revealed hill is lit right through, middle
 * and all: the renderer's DARK_RADIUS darkness stands down while a fog
 * is on, so the fog's own black is the only black on the map.
 *
 * WHEN IT IS RECOMPUTED. A structure's vision only ever changes when one
 * appears, finishes or goes. Adding a source is ADDITIVE, so a placed
 * turret lights its circle at once (a chain of walls dragged out into the
 * fog reveals as it goes, each wall lighting the ground the next one
 * needs). Losing a source cannot be undone locally, so it marks the fog
 * dirty and the next `ensure` rebuilds from every source still standing.
 *
 * A MOVING EYE IS REBUILT EVERY TICK (`refresh`). A unit walking carries
 * its circle with it, and a circle that only moves twice a second reveals
 * the ground in visible steps — a cell at a time, on a clock the player
 * can count. So while the player has bodies out the whole fog is recast
 * every tick, which is affordable for two reasons: the rebuild resets
 * only the cells it lit LAST time (`lit`) instead of scanning the map,
 * and the renderer re-uploads only the rectangle that actually changed
 * (`dirtyRect`) instead of the whole texture.
 */
export const FOG_NEVER = 0;
export const FOG_SEEN = 1;
export const FOG_VISIBLE = 2;

/** the share of a turret's range it can see — see the note above */
export const VISION_OF_RANGE = 0.75;
/** what a wall, a shell under construction, or a rangeless turret sees, in cells */
export const VISION_MIN_CELLS = 3;
/**
 * What the core sees, in cells — far more than any turret. The core is
 * the eye of the position: a run opens with the ground the player will
 * build on already lit, out to about the width of the starting view,
 * and the rest of the map (512 cells across) still dark.
 */
export const CORE_VISION_CELLS = 34;
/** how dark seen-but-unwatched ground is drawn: black at this alpha */
export const FOG_SEEN_ALPHA = 0.5;

export interface VisionSource {
  /** world px */
  x: number;
  y: number;
  /** world px */
  r: number;
}

export class Fog {
  /** per cell: FOG_NEVER, FOG_SEEN or FOG_VISIBLE */
  readonly state = new Uint8Array(NCELLS);
  /**
   * bumps on every change to `state` — the renderer re-uploads its
   * texture and the minimap repaints its wash only when this moves
   */
  version = 1;
  /**
   * THE CELLS LIT RIGHT NOW, as indices — what a rebuild has to put back
   * to FOG_SEEN before it recasts. Kept because a rebuild that runs every
   * tick cannot afford to walk the whole grid to find them: the lit set is
   * a few thousand cells on a board with a hundred eyes, the grid is a
   * quarter of a million.
   */
  private lit = new Int32Array(1024);
  private litN = 0;
  /**
   * The smallest rectangle covering every cell that has changed since the
   * renderer last took the fog (takeDirty): x0,y0,x1,y1 inclusive, empty
   * when x1 < x0. A moving unit dirties a few dozen cells a tick and the
   * texture upload follows it rather than re-sending a megabyte.
   */
  private dx0 = 0;
  private dy0 = 0;
  private dx1 = -1;
  private dy1 = -1;
  /** the rectangle the last cast lit, so the next rebuild can dirty it */
  private lx0 = 0;
  private ly0 = 0;
  private lx1 = -1;
  private ly1 = -1;
  /**
   * OFF means everything is visible, always: the title screen's field and
   * the headless balance bot play without fog, and both read `state` the
   * same way the game does — it is simply all FOG_VISIBLE there.
   */
  enabled = true;
  private dirty = false;

  /** a new map: nothing seen */
  reset(enabled: boolean): void {
    this.enabled = enabled;
    this.state.fill(enabled ? FOG_NEVER : FOG_VISIBLE);
    this.dirty = false;
    this.litN = 0;
    this.lx1 = -1;
    this.lx0 = 0;
    this.markAll();
    this.version++;
  }

  /** the whole map has changed under the renderer */
  private markAll(): void {
    this.dx0 = 0;
    this.dy0 = 0;
    this.dx1 = COLS - 1;
    this.dy1 = ROWS - 1;
  }

  /** grow the dirty rectangle over a cell range */
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

  /**
   * What has changed since this was last asked, as a cell rectangle — the
   * renderer's upload window. Asking clears it, so two readers cannot both
   * be served; there is one (Renderer.drawFog).
   */
  takeDirty(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (this.dx1 < this.dx0) return null;
    const r = { x0: this.dx0, y0: this.dy0, x1: this.dx1, y1: this.dy1 };
    this.dx1 = -1;
    this.dx0 = 0;
    return r;
  }

  /** is this cell in sight right now? Out of the grid is never in sight */
  isVisible(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return false;
    return this.state[gy * COLS + gx] === FOG_VISIBLE;
  }

  /** is this world point in sight right now? */
  visibleAt(px: number, py: number): boolean {
    return this.isVisible((px / CELL) | 0, (py / CELL) | 0);
  }

  /** has this world point ever been seen? (a remembered structure is drawn here) */
  seenAt(px: number, py: number): boolean {
    const gx = (px / CELL) | 0, gy = (py / CELL) | 0;
    if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return false;
    return this.state[gy * COLS + gx] !== FOG_NEVER;
  }

  /** a source went away: the next ensure() rebuilds from scratch */
  invalidate(): void {
    if (this.enabled) this.dirty = true;
  }

  /**
   * A source that just appeared, or just grew (a shell finishing): light
   * its circle now. Additive, so nothing else needs redoing.
   */
  add(src: VisionSource): void {
    if (!this.enabled) return;
    // a dirty fog is about to be rebuilt from every source anyway, and
    // this one will be in the list by then
    if (this.dirty) return;
    this.cast(src);
    this.version++;
  }

  /** settle a dirty fog from every source standing, if one is owed */
  ensure(sources: () => readonly VisionSource[]): void {
    if (!this.dirty || !this.enabled) return;
    this.refresh(sources);
  }

  /**
   * Recast the whole fog from every eye standing: what was lit goes back
   * to remembered, and every source lights its circle again. Cheap enough
   * to run every tick — the reset walks the lit set, not the map.
   */
  refresh(sources: () => readonly VisionSource[]): void {
    if (!this.enabled) return;
    this.dirty = false;
    const s = this.state, lit = this.lit;
    // the ground closing behind an eye changed as much as the ground
    // opening in front of it, so last cast's whole footprint is dirty
    if (this.lx1 >= this.lx0) this.mark(this.lx0, this.ly0, this.lx1, this.ly1);
    this.lx1 = -1;
    this.lx0 = 0;
    for (let k = 0; k < this.litN; k++) if (s[lit[k]] === FOG_VISIBLE) s[lit[k]] = FOG_SEEN;
    this.litN = 0;
    for (const src of sources()) this.cast(src);
    this.version++;
  }

  /**
   * One source's sight: every cell whose centre falls inside the circle,
   * whatever stands between. See the note above — the fog is a radius,
   * not a line of sight.
   */
  private cast(src: VisionSource): void {
    const s = this.state;
    const cx = clamp((src.x / CELL) | 0, 0, COLS - 1);
    const cy = clamp((src.y / CELL) | 0, 0, ROWS - 1);
    const rc = Math.max(1, Math.ceil(src.r / CELL));
    const r2 = src.r * src.r;
    const y0 = Math.max(0, cy - rc), y1 = Math.min(ROWS - 1, cy + rc);
    const x0 = Math.max(0, cx - rc), x1 = Math.min(COLS - 1, cx + rc);
    this.mark(x0, y0, x1, y1);
    // ...and into the lit rectangle, which is what the next rebuild has to
    // put back before it recasts
    if (this.lx1 < this.lx0) {
      this.lx0 = x0;
      this.ly0 = y0;
      this.lx1 = x1;
      this.ly1 = y1;
    } else {
      if (x0 < this.lx0) this.lx0 = x0;
      if (y0 < this.ly0) this.ly0 = y0;
      if (x1 > this.lx1) this.lx1 = x1;
      if (y1 > this.ly1) this.ly1 = y1;
    }
    this.light(cy * COLS + cx);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5) * CELL - src.y, dy2 = dy * dy;
      const row = y * COLS;
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5) * CELL - src.x;
        if (dx * dx + dy2 <= r2) this.light(row + x);
      }
    }
  }

  /**
   * One cell lit, and remembered so the next rebuild can put it back. A
   * cell two circles both cover lands in the list twice, which costs one
   * extra write on the next reset and nothing else — cheaper than the
   * membership test that would keep it out.
   */
  private light(i: number): void {
    this.state[i] = FOG_VISIBLE;
    if (this.litN >= this.lit.length) {
      const bigger = new Int32Array(this.lit.length * 2);
      bigger.set(this.lit);
      this.lit = bigger;
    }
    this.lit[this.litN++] = i;
  }
}
