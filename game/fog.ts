/**
 * THE FOG — three layers over the ground, and nothing hidden by any of
 * them. See docs/fog.md for what the layers mean and what lights them.
 *
 * It is a MASK AND NOT A RULE: one byte a cell of black, handed to the
 * renderer as a texture and to the minimap as a wash. The sim never reads
 * it, so a turret shoots what it always shot and a body walks where it
 * always walked — which is why this lives on the drawing side at all.
 *
 * THE LIGHT IS IN TWO HALVES AND THAT IS THE WHOLE PERFORMANCE OF IT.
 * Turrets, the core and the beacons do not move, so what they light is
 * kept (`base`) and recomputed only when one of them is built, sold,
 * upgraded or switched on. The hauler does move, and re-stamping seven
 * thousand turrets every time it crossed a cell was a thirty-millisecond
 * hitch several times a second; it is laid over the finished mask
 * instead, which is a disc forty cells across and costs nothing.
 */
import {
  BEACON_POWER_R,
  BEACON_SIZE,
  BEACON_VISION_FADE_R,
  BEACON_VISION_R,
  CELL,
  COLS,
  ROWS,
} from "./constants";
import type { SimView } from "./simview";

/** ground nobody has ever had eyes on */
const UNSEEN_A = 0.55;
/** ...and ground that has been in sight and is not now */
const SEEN_A = 0.3;
const UNSEEN_B = Math.round(UNSEEN_A * 255);
const SEEN_B = Math.round(SEEN_A * 255);

/** how far past its reach a source's light takes to die */
const FADE = 5 * CELL;
/** the least a turret sees by, however short its gun is */
const TOWER_MIN_R = 9 * CELL;
const CORE_R = 26 * CELL;
const CONVOY_R = 13 * CELL;
/** a cell lit at least this much has been SEEN, and stays seen */
const SEEN_AT = 0.5;
/**
 * THE LEAST FRAMES BETWEEN TWO REBUILDS OF THE STILL LIGHT. A wave
 * chewing through a big board changes the turret line several times a
 * second, and the rebuild is the one expensive thing here — so changes
 * are allowed to queue up and land together. Fog is a slow, soft thing
 * and nobody sees the eighth of a second.
 */
const BASE_COOL = 5;
/** the corridor a mission's own geometry is revealed in (Fog.reveal) */
export const FOG_MISSION_R = 8 * CELL;

export interface FogRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const empty = (): FogRect => ({ x0: COLS, y0: ROWS, x1: -1, y1: -1 });
const whole = (): FogRect => ({ x0: 0, y0: 0, x1: COLS - 1, y1: ROWS - 1 });

function grow(box: FogRect, x0: number, y0: number, x1: number, y1: number): void {
  if (x0 < box.x0) box.x0 = x0;
  if (y0 < box.y0) box.y0 = y0;
  if (x1 > box.x1) box.x1 = x1;
  if (y1 > box.y1) box.y1 = y1;
}

export class Fog {
  /** one byte a cell, 0 clear to 255 black — the whole of what is drawn */
  readonly alpha = new Uint8Array(COLS * ROWS).fill(UNSEEN_B);
  private readonly seen = new Uint8Array(COLS * ROWS);
  /** what the things that never move light, so that they are stamped once
   *  and not once a frame */
  private readonly base = new Uint8Array(COLS * ROWS);
  private baseSig = 0;
  private baseBox = empty();
  private moveSig = 0;
  private moveBox = empty();
  private cool = 0;
  private computed = false;
  private dirty = whole();
  private hasDirty = true;
  /** bumped whenever `alpha` moves. The renderer takes the dirty rect and
   *  empties it, so a second reader (the minimap) needs its own way to ask
   *  whether the mask it last painted is still the mask */
  private ver = 0;
  get version(): number {
    return this.ver;
  }

  /** a new level is a new map and a new memory of it */
  reset(): void {
    this.alpha.fill(UNSEEN_B);
    this.seen.fill(0);
    this.base.fill(0);
    this.baseBox = empty();
    this.moveBox = empty();
    this.cool = 0;
    this.computed = false;
    this.dirty = whole();
    this.hasDirty = true;
    this.ver++;
  }

  /**
   * MARK A DISC SEEN FOR GOOD, with no live light in it. This is how a
   * mission's furniture is on the map from the first frame: the player is
   * owed where the road runs and where the guns will stand, and owed it
   * before anything is standing there.
   */
  reveal(x: number, y: number, r: number): void {
    const cx = x / CELL - 0.5, cy = y / CELL - 0.5, cr = r / CELL;
    const x0 = Math.max(0, Math.floor(cx - cr)), x1 = Math.min(COLS - 1, Math.ceil(cx + cr));
    const y0 = Math.max(0, Math.floor(cy - cr)), y1 = Math.min(ROWS - 1, Math.ceil(cy + cr));
    if (x1 < x0 || y1 < y0) return;
    const rr = cr * cr;
    let hit = false;
    for (let gy = y0; gy <= y1; gy++) {
      const dy = gy - cy, row = gy * COLS;
      for (let gx = x0; gx <= x1; gx++) {
        const dx = gx - cx;
        if (dx * dx + dy * dy > rr) continue;
        const i = row + gx;
        if (this.seen[i]) continue;
        this.seen[i] = 1;
        this.alpha[i] = SEEN_B;
        hit = true;
      }
    }
    if (hit) this.soiled(x0, y0, x1, y1);
  }

  /** ...and the same along a line: the roads a crosser and a hauler walk */
  revealLine(pts: ArrayLike<number>, r: number): void {
    const step = Math.max(CELL, r * 0.5);
    for (let k = 2; k < pts.length; k += 2) {
      const ax = pts[k - 2], ay = pts[k - 1];
      const bx = pts[k], by = pts[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
      for (let s = 0; s <= n; s++) this.reveal(ax + ((bx - ax) * s) / n, ay + ((by - ay) * s) / n, r);
    }
  }

  /**
   * RECOMPUTE THE LIGHT, but only the half of it that moved. Nothing that
   * sees is in a hurry — turrets and beacons do not move at all and the
   * hauler crosses a cell in the better part of a second — so the two
   * signatures below turn nearly every frame into a comparison and no
   * work at all.
   */
  update(view: SimView): void {
    const bsig = this.baseSignature(view);
    const msig = this.moveSignature(view);
    const first = !this.computed;
    if (this.cool > 0) this.cool--;
    // a change that arrives inside the cooldown is not forgotten, only
    // held: `baseSig` is left alone, so the next frame off the clock does it
    const doBase = first || (bsig !== this.baseSig && this.cool === 0);
    if (!doBase && msig === this.moveSig) return;
    this.computed = true;

    const redo = empty();
    if (doBase) {
      this.cool = BASE_COOL;
      this.baseSig = bsig;
      const was = this.baseBox;
      for (let gy = was.y0; gy <= was.y1; gy++) {
        this.base.fill(0, gy * COLS + was.x0, gy * COLS + was.x1 + 1);
      }
      const now = empty();
      const core = view.core;
      this.light(now, core.x, core.y, CORE_R);
      for (const t of view.towers) {
        if (t.team !== "player") continue;
        this.light(now, t.x, t.y, Math.max(t.spec.range, TOWER_MIN_R));
      }
      const beacons = view.terrain.beacons;
      for (let i = 0; i < beacons.length; i++) {
        const b = beacons[i];
        const x = (b.x + BEACON_SIZE / 2) * CELL, y = (b.y + BEACON_SIZE / 2) * CELL;
        // AN UNBOUGHT BEACON STILL SEES ITS OWN HILL (constants.ts
        // BEACON_VISION_R): it is a lamp on a mast whoever owns it, and a
        // player who cannot find one cannot decide to buy it
        if (view.beaconOn[i]) this.light(now, x, y, BEACON_POWER_R);
        else this.light(now, x, y, BEACON_VISION_R, BEACON_VISION_FADE_R - BEACON_VISION_R);
      }
      grow(redo, was.x0, was.y0, was.x1, was.y1);
      grow(redo, now.x0, now.y0, now.x1, now.y1);
      this.baseBox = now;
    }
    // the ground the hauler lit last time goes back to whatever the still
    // half of the board makes of it, whether or not it lights anything now
    this.moveSig = msig;
    const wasMove = this.moveBox;
    grow(redo, wasMove.x0, wasMove.y0, wasMove.x1, wasMove.y1);
    const nowMove = empty();
    this.moveBox = nowMove;

    // the still half is put back first and the hauler laid over it after,
    // which is the order the two composing depends on
    if (redo.x1 >= redo.x0 && redo.y1 >= redo.y0) {
      for (let gy = redo.y0; gy <= redo.y1; gy++) {
        const row = gy * COLS;
        for (let gx = redo.x0; gx <= redo.x1; gx++) {
          const i = row + gx;
          const back = this.seen[i] ? SEEN_B : UNSEEN_B;
          this.alpha[i] = ((back * (255 - this.base[i])) / 255) | 0;
        }
      }
    }
    const cv = view.convoy;
    if (cv.live) this.moving(nowMove, cv.x, cv.y, CONVOY_R);
    grow(redo, nowMove.x0, nowMove.y0, nowMove.x1, nowMove.y1);
    if (redo.x1 < redo.x0 || redo.y1 < redo.y0) return;
    this.soiled(redo.x0, redo.y0, redo.x1, redo.y1);
  }

  /** the rect of `alpha` that has moved since this was last asked, and it
   *  is emptied by the asking — the renderer uploads exactly this much */
  takeDirty(): FogRect | null {
    if (!this.hasDirty) return null;
    this.hasDirty = false;
    const r = this.dirty;
    this.dirty = empty();
    return r;
  }

  /** one still source's disc, into `base` */
  private light(box: FogRect, x: number, y: number, r: number, fade = FADE): void {
    const cx = x / CELL - 0.5, cy = y / CELL - 0.5;
    const cr = r / CELL, cf = (r + fade) / CELL;
    const x0 = Math.max(0, Math.floor(cx - cf)), x1 = Math.min(COLS - 1, Math.ceil(cx + cf));
    const y0 = Math.max(0, Math.floor(cy - cf)), y1 = Math.min(ROWS - 1, Math.ceil(cy + cf));
    if (x1 < x0 || y1 < y0) return;
    const rr = cr * cr, ff = cf * cf, span = Math.max(1e-3, cf - cr);
    for (let gy = y0; gy <= y1; gy++) {
      const dy = gy - cy, row = gy * COLS;
      for (let gx = x0; gx <= x1; gx++) {
        const dx = gx - cx, d2 = dx * dx + dy * dy;
        if (d2 > ff) continue;
        const s = d2 <= rr ? 1 : 1 - (Math.sqrt(d2) - cr) / span;
        const i = row + gx;
        const v = (s * 255) | 0;
        if (v > this.base[i]) this.base[i] = v;
        if (s >= SEEN_AT) this.seen[i] = 1;
      }
    }
    grow(box, x0, y0, x1, y1);
  }

  /**
   * ...and one MOVING source's, straight onto the finished mask. It only
   * ever makes a cell lighter, so it composes with the still half without
   * a second buffer to hold it — and the ground it leaves behind is put
   * back by the rebuild above, which always covers where it was.
   */
  private moving(box: FogRect, x: number, y: number, r: number): void {
    const cx = x / CELL - 0.5, cy = y / CELL - 0.5;
    const cr = r / CELL, cf = (r + FADE) / CELL;
    const x0 = Math.max(0, Math.floor(cx - cf)), x1 = Math.min(COLS - 1, Math.ceil(cx + cf));
    const y0 = Math.max(0, Math.floor(cy - cf)), y1 = Math.min(ROWS - 1, Math.ceil(cy + cf));
    if (x1 < x0 || y1 < y0) return;
    const rr = cr * cr, ff = cf * cf, span = Math.max(1e-3, cf - cr);
    for (let gy = y0; gy <= y1; gy++) {
      const dy = gy - cy, row = gy * COLS;
      for (let gx = x0; gx <= x1; gx++) {
        const dx = gx - cx, d2 = dx * dx + dy * dy;
        if (d2 > ff) continue;
        const s = d2 <= rr ? 1 : 1 - (Math.sqrt(d2) - cr) / span;
        const i = row + gx;
        if (s >= SEEN_AT) this.seen[i] = 1;
        const back = this.seen[i] ? SEEN_B : UNSEEN_B;
        const a = ((back * (255 - ((s * 255) | 0))) / 255) | 0;
        if (a < this.alpha[i]) this.alpha[i] = a;
      }
    }
    grow(box, x0, y0, x1, y1);
  }

  private soiled(x0: number, y0: number, x1: number, y1: number): void {
    grow(this.dirty, x0, y0, x1, y1);
    this.hasDirty = true;
    this.ver++;
  }

  /**
   * EVERYTHING STILL THAT CASTS LIGHT, IN ONE NUMBER. A turret's cell and
   * its LIVE reach both count — an upgrade that lengthens a gun lengthens
   * what it sees.
   */
  private baseSignature(view: SimView): number {
    let h = 0x811c9dc5;
    for (const t of view.towers) {
      if (t.team !== "player") continue;
      h = Math.imul(h ^ (t.gx | 0), 16777619);
      h = Math.imul(h ^ (t.gy | 0), 16777619);
      h = Math.imul(h ^ (t.spec.range | 0), 16777619);
    }
    const on = view.beaconOn;
    for (let i = 0; i < on.length; i++) if (on[i]) h = Math.imul(h ^ (i + 1), 16777619);
    h = Math.imul(h ^ (view.core.gx | 0), 16777619);
    return Math.imul(h ^ (view.core.gy | 0), 16777619);
  }

  /** ...and the hauler, at the cell it stands in, which is the grid its
   *  light is stamped on anyway */
  private moveSignature(view: SimView): number {
    const cv = view.convoy;
    if (!cv.live) return 0;
    const h = Math.imul(0x811c9dc5 ^ ((cv.x / CELL) | 0), 16777619);
    return Math.imul(h ^ ((cv.y / CELL) | 0), 16777619) | 1;
  }
}
