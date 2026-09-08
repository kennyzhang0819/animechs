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
 * WHEN IT IS RECOMPUTED. Vision only ever changes when a structure
 * appears, finishes or goes — the enemy sees nothing for the player.
 * Adding a source is ADDITIVE, so a placed turret lights its circle at
 * once (a chain of walls dragged out into the fog reveals as it goes,
 * each wall lighting the ground the next one needs). Losing a source is the
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
/**
 * What the core sees, in cells — far more than any turret. The core is
 * the eye of the position: a run opens with the ground the player will
 * build on already lit, out to about the width of the starting view,
 * and the rest of the map (256 cells across) still dark.
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
    this.dirty = false;
    const s = this.state;
    for (let i = 0; i < NCELLS; i++) if (s[i] === FOG_VISIBLE) s[i] = FOG_SEEN;
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
    s[cy * COLS + cx] = FOG_VISIBLE;
    const y0 = Math.max(0, cy - rc), y1 = Math.min(ROWS - 1, cy + rc);
    const x0 = Math.max(0, cx - rc), x1 = Math.min(COLS - 1, cx + rc);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5) * CELL - src.y, dy2 = dy * dy;
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5) * CELL - src.x;
        if (dx * dx + dy2 <= r2) s[y * COLS + x] = FOG_VISIBLE;
      }
    }
  }
}
