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
 * SIGHT STOPS AT A HILL. Vision is cast as rays from the source to every
 * cell on the rim of its circle, walked one grid step at a time (the same
 * walk Sim.hasSight makes), and a ray that enters rock reveals the rock's
 * FACE and goes no further. A ridge is seen and what is behind it is
 * not; the inside of a range is never revealed at all, which is why the
 * fog is the hill darkness too (the renderer's DARK_RADIUS pass steps
 * aside while fog is on).
 *
 * WHEN IT IS RECOMPUTED. Vision only ever changes when a structure
 * appears, finishes or goes — the enemy sees nothing for the player.
 * Adding a source is ADDITIVE, so a placed turret casts its rays at once
 * (a chain of walls dragged out into the fog reveals as it goes, each
 * wall lighting the ground the next one needs). Losing a source is the
 * one case that cannot be undone locally, so it marks the fog dirty and
 * the next `ensure` recomputes the whole thing from every source still
 * standing — a few milliseconds, paid once per demolition, never per
 * frame.
 */
export const FOG_NEVER = 0;
export const FOG_SEEN = 1;
export const FOG_VISIBLE = 2;

/** the share of a turret's range it can see — see the note above */
export const VISION_OF_RANGE = 0.75;
/** what a wall, a shell under construction, or a rangeless turret sees, in cells */
export const VISION_MIN_CELLS = 3;
/** what the core sees, in cells */
export const CORE_VISION_CELLS = 14;
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
   * OFF means everything is visible, always: the title screen's field and
   * the headless balance bot play without fog, and both read `state` the
   * same way the game does — it is simply all FOG_VISIBLE there.
   */
  enabled = true;
  private hills: Uint8Array = new Uint8Array(NCELLS);
  private dirty = false;

  /** a new map: nothing seen, and the rock sight stops at */
  reset(hills: Uint8Array, enabled: boolean): void {
    this.hills = hills;
    this.enabled = enabled;
    this.state.fill(enabled ? FOG_NEVER : FOG_VISIBLE);
    this.dirty = false;
    this.version++;
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
   * A source that just appeared, or just grew (a shell finishing): cast
   * its rays now. Additive, so nothing else needs redoing.
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
    this.dirty = false;
    const s = this.state;
    for (let i = 0; i < NCELLS; i++) if (s[i] === FOG_VISIBLE) s[i] = FOG_SEEN;
    for (const src of sources()) this.cast(src);
    this.version++;
  }

  /**
   * One source's sight: a ray to every cell on the rim of the square that
   * holds its circle, each walked cell by cell from the source outward and
   * stopped at the circle's edge or at the first rock it enters. The rock
   * is marked before the stop, so a ridge shows its face.
   */
  private cast(src: VisionSource): void {
    const s = this.state;
    const cx = clamp((src.x / CELL) | 0, 0, COLS - 1);
    const cy = clamp((src.y / CELL) | 0, 0, ROWS - 1);
    const rc = Math.max(1, Math.ceil(src.r / CELL));
    const r2 = src.r * src.r;
    s[cy * COLS + cx] = FOG_VISIBLE;
    const x0 = cx - rc, x1 = cx + rc, y0 = cy - rc, y1 = cy + rc;
    for (let x = x0; x <= x1; x++) {
      this.ray(src, cx, cy, x, y0, r2);
      this.ray(src, cx, cy, x, y1, r2);
    }
    for (let y = y0 + 1; y < y1; y++) {
      this.ray(src, cx, cy, x0, y, r2);
      this.ray(src, cx, cy, x1, y, r2);
    }
  }

  /**
   * The grid walk of Sim.hasSight: from (cx, cy) toward (ex, ey), one axis
   * step at a time in the order the line crosses cell boundaries, so the
   * cells marked are exactly the cells the line passes through and a
   * diagonal never slips between two rocks.
   */
  private ray(src: VisionSource, cx: number, cy: number, ex: number, ey: number, r2: number): void {
    const s = this.state, hills = this.hills;
    const x0 = src.x, y0 = src.y;
    const x1 = (ex + 0.5) * CELL, y1 = (ey + 0.5) * CELL;
    const dx = x1 - x0, dy = y1 - y0;
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    let tx = dx === 0 ? Infinity : ((dx > 0 ? cx + 1 : cx) * CELL - x0) / dx;
    let ty = dy === 0 ? Infinity : ((dy > 0 ? cy + 1 : cy) * CELL - y0) / dy;
    const gx = dx === 0 ? Infinity : Math.abs(CELL / dx);
    const gy = dy === 0 ? Infinity : Math.abs(CELL / dy);
    for (let n = COLS + ROWS + 2; n > 0; n--) {
      if (tx < ty) {
        cx += sx;
        tx += gx;
      } else {
        cy += sy;
        ty += gy;
      }
      if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
      // the circle's edge, measured to the cell's centre
      const ddx = (cx + 0.5) * CELL - x0, ddy = (cy + 0.5) * CELL - y0;
      if (ddx * ddx + ddy * ddy > r2) return;
      const i = cy * COLS + cx;
      s[i] = FOG_VISIBLE;
      if (hills[i]) return; // the face is seen; what is behind it is not
      if (cx === ex && cy === ey) return;
    }
  }
}
