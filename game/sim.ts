import {
  CELL,
  clamp,
  COLS,
  DEFAULT_TARGET,
  H,
  HP0,
  MAX_UNITS,
  ROWS,
  TOWER,
  UR,
  W,
} from "./constants";
import { FlowField, type Vec2 } from "./flowfield";
import { FxKind, type Effect, type Projectile, type Tower } from "./types";

const FX_CAP = 400;

// spatial hash cell size (px); rebuilt every frame with a counting sort
const HC = 8;
const HCOLS = (W / HC) | 0;
const HROWS = (H / HC) | 0;
const HN = HCOLS * HROWS;

export type PlaceResult = "ok" | "invalid" | "would-seal";

/**
 * The whole simulation: units in struct-of-arrays, a spatial hash for
 * separation and projectile hits, towers, and the flow field they block.
 */
export class Sim {
  readonly field = new FlowField();

  readonly upx = new Float32Array(MAX_UNITS);
  readonly upy = new Float32Array(MAX_UNITS);
  readonly uvx = new Float32Array(MAX_UNITS);
  readonly uvy = new Float32Array(MAX_UNITS);
  readonly uhp = new Float32Array(MAX_UNITS);
  readonly uspd = new Float32Array(MAX_UNITS);
  n = 0;

  target = DEFAULT_TARGET;
  kills = 0;
  leaked = 0;

  towers: Tower[] = [];
  projs: Projectile[] = [];
  effects: Effect[] = [];

  private readonly bStart = new Int32Array(HN + 1);
  private readonly bCount = new Int32Array(HN);
  private readonly bUnits = new Int32Array(MAX_UNITS);
  private readonly flowTmp: Vec2 = { x: 0, y: 0 };

  constructor() {
    this.reset();
  }

  reset(): void {
    this.n = 0;
    this.kills = 0;
    this.leaked = 0;
    this.projs.length = 0;
    this.effects.length = 0;
    this.towers.length = 0;
    this.addTower(18, 16); // just past the first wall gap — every lane funnels through here
    this.field.rebuildWalk(this.towers);
    this.field.compute();
  }

  private addTower(gx: number, gy: number): void {
    this.towers.push({
      gx,
      gy,
      x: (gx + 1) * CELL,
      y: (gy + 1) * CELL,
      cd: Math.random() * 0.1,
      angle: 0,
    });
  }

  update(dt: number): void {
    const want = Math.min(
      this.target - this.n,
      Math.ceil(Math.max(400, this.target / 5) * dt),
    );
    for (let s = 0; s < want; s++) this.spawnUnit();

    this.buildHash();
    this.updateUnits(dt);
    this.fireTowers(dt);
    this.updateProjectiles(dt);

    const fx = this.effects;
    for (let e = fx.length - 1; e >= 0; e--) {
      fx[e].age += dt;
      if (fx[e].age >= fx[e].ttl) {
        fx[e] = fx[fx.length - 1];
        fx.pop();
      }
    }
  }

  // ---------- placement ----------

  canPlace(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx > COLS - 2 || gy > ROWS - 2) return false;
    const { walk, isGoal } = this.field;
    for (let y = gy; y < gy + 2; y++)
      for (let x = gx; x < gx + 2; x++) {
        const i = y * COLS + x;
        if (walk[i] || isGoal[i]) return false;
      }
    return true;
  }

  placeTower(gx: number, gy: number): PlaceResult {
    if (!this.canPlace(gx, gy)) return "invalid";
    // tentatively block, and reject if the swarm could no longer reach the core
    const { walk } = this.field;
    for (let y = gy; y < gy + 2; y++)
      for (let x = gx; x < gx + 2; x++) walk[y * COLS + x] = 1;
    this.field.compute();
    if (this.field.spawnRows.length === 0) {
      for (let y = gy; y < gy + 2; y++)
        for (let x = gx; x < gx + 2; x++) walk[y * COLS + x] = 0;
      this.field.compute();
      return "would-seal";
    }
    this.addTower(gx, gy);
    this.unstickUnits();
    return "ok";
  }

  // ---------- spawning ----------

  /**
   * A spawn spot is free if no unit from last frame's hash sits on it —
   * keeps the spawn strip from overcrowding, so separation never
   * slingshots units forward.
   */
  private spawnSpotFree(x: number, y: number): boolean {
    const r2 = UR * 2 * (UR * 2);
    const hx = clamp((x / HC) | 0, 0, HCOLS - 1);
    const hy = clamp((y / HC) | 0, 0, HROWS - 1);
    for (let gy = Math.max(0, hy - 1); gy <= Math.min(HROWS - 1, hy + 1); gy++) {
      for (let gx = Math.max(0, hx - 1); gx <= Math.min(HCOLS - 1, hx + 1); gx++) {
        const c = gy * HCOLS + gx, e = this.bStart[c + 1];
        for (let k = this.bStart[c]; k < e; k++) {
          const i = this.bUnits[k];
          if (i >= this.n) continue;
          const dx = this.upx[i] - x, dy = this.upy[i] - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
    }
    return true;
  }

  private spawnUnit(): void {
    const { spawnRows } = this.field;
    if (this.n >= MAX_UNITS || this.n >= this.target || spawnRows.length === 0) return;
    for (let a = 0; a < 3; a++) {
      const row = spawnRows[(Math.random() * spawnRows.length) | 0];
      const x = 5 + Math.random() * 38;
      const y = (row + 0.15 + Math.random() * 0.7) * CELL;
      if (!this.spawnSpotFree(x, y)) continue;
      const i = this.n++;
      this.upx[i] = x;
      this.upy[i] = y;
      this.uvx[i] = 0;
      this.uvy[i] = 0;
      this.uhp[i] = HP0;
      this.uspd[i] = 52 + Math.random() * 26;
      return;
    }
  }

  private removeUnit(i: number): void {
    const n = --this.n;
    this.upx[i] = this.upx[n];
    this.upy[i] = this.upy[n];
    this.uvx[i] = this.uvx[n];
    this.uvy[i] = this.uvy[n];
    this.uhp[i] = this.uhp[n];
    this.uspd[i] = this.uspd[n];
  }

  // ---------- spatial hash ----------

  private hashCellOf(i: number): number {
    return (
      clamp((this.upy[i] / HC) | 0, 0, HROWS - 1) * HCOLS +
      clamp((this.upx[i] / HC) | 0, 0, HCOLS - 1)
    );
  }

  private buildHash(): void {
    const { bStart, bCount, bUnits } = this;
    bCount.fill(0);
    for (let i = 0; i < this.n; i++) bCount[this.hashCellOf(i)]++;
    let s = 0;
    for (let c = 0; c < HN; c++) {
      bStart[c] = s;
      s += bCount[c];
    }
    bStart[HN] = s;
    bCount.fill(0);
    for (let i = 0; i < this.n; i++) {
      const c = this.hashCellOf(i);
      bUnits[bStart[c] + bCount[c]++] = i;
    }
  }

  // ---------- units ----------

  private updateUnits(dt: number): void {
    const { upx, upy, uvx, uvy, uspd, field, flowTmp, bStart, bUnits } = this;
    const steer = Math.min(1, dt * 8);
    const R2 = UR * 2 * (UR * 2);
    const PR = UR + 4, REP = 55, SMAX = 70;
    const { isGoal } = field;

    for (let i = this.n - 1; i >= 0; i--) {
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      if (isGoal[cy * COLS + cx]) {
        this.pushFx(upx[i], upy[i], 0.4, FxKind.Breach);
        this.removeUnit(i);
        this.leaked++;
        continue;
      }

      field.sample(upx[i], upy[i], flowTmp);
      uvx[i] += (flowTmp.x * uspd[i] - uvx[i]) * steer;
      uvy[i] += (flowTmp.y * uspd[i] - uvy[i]) * steer;

      // separation from neighbours via the hash
      let sx = 0, sy = 0;
      const hx = clamp((upx[i] / HC) | 0, 0, HCOLS - 1);
      const hy = clamp((upy[i] / HC) | 0, 0, HROWS - 1);
      for (let gy = Math.max(0, hy - 1); gy <= Math.min(HROWS - 1, hy + 1); gy++) {
        for (let gx = Math.max(0, hx - 1); gx <= Math.min(HCOLS - 1, hx + 1); gx++) {
          const c = gy * HCOLS + gx, e = bStart[c + 1];
          for (let k = bStart[c]; k < e; k++) {
            const j = bUnits[k];
            if (j === i || j >= this.n) continue;
            const dx = upx[i] - upx[j], dy = upy[i] - upy[j];
            const d2 = dx * dx + dy * dy;
            if (d2 > R2 || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const push = (UR * 2 - d) / d;
            sx += dx * push;
            sy += dy * push;
          }
        }
      }
      let fx = sx * 14, fy = sy * 14;
      const fl = Math.hypot(fx, fy);
      if (fl > SMAX) {
        fx = (fx / fl) * SMAX;
        fy = (fy / fl) * SMAX;
      }

      // wall repulsion probes: push off nearby walls so corners can't wedge units
      if (field.blockedPx(upx[i] + PR, upy[i])) fx -= REP;
      if (field.blockedPx(upx[i] - PR, upy[i])) fx += REP;
      if (field.blockedPx(upx[i], upy[i] + PR)) fy -= REP;
      if (field.blockedPx(upx[i], upy[i] - PR)) fy += REP;

      // axis-separated move; a blocked axis redirects its speed into the free one
      let nx = upx[i] + (uvx[i] + fx) * dt;
      if (field.hitsWall(nx, upy[i], UR)) {
        nx = upx[i];
        uvy[i] += Math.sign(uvy[i] || flowTmp.y || 1) * Math.abs(uvx[i]) * 0.6;
        uvx[i] = 0;
      }
      let ny = upy[i] + (uvy[i] + fy) * dt;
      if (field.hitsWall(nx, ny, UR)) {
        ny = upy[i];
        uvx[i] += Math.sign(uvx[i] || flowTmp.x || 1) * Math.abs(uvy[i]) * 0.6;
        uvy[i] = 0;
      }
      upx[i] = clamp(nx, UR, W - UR);
      upy[i] = clamp(ny, UR, H - UR);
    }
  }

  /** push units out of freshly blocked cells (after tower placement) */
  private unstickUnits(): void {
    const { upx, upy, field } = this;
    for (let i = 0; i < this.n; i++) {
      if (!field.hitsWall(upx[i], upy[i], UR)) continue;
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      let done = false;
      for (let r = 1; r <= 3 && !done; r++) {
        for (let dy = -r; dy <= r && !done; dy++) {
          for (let dx = -r; dx <= r && !done; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
            if (field.walk[ny * COLS + nx]) continue;
            upx[i] = (nx + 0.5) * CELL + (Math.random() - 0.5) * 6;
            upy[i] = (ny + 0.5) * CELL + (Math.random() - 0.5) * 6;
            done = true;
          }
        }
      }
    }
  }

  // ---------- towers & projectiles ----------

  private fireTowers(dt: number): void {
    const { upx, upy, uvx, uvy } = this;
    for (const t of this.towers) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      let best = -1, bd = TOWER.range * TOWER.range;
      for (let i = 0; i < this.n; i++) {
        const dx = upx[i] - t.x, dy = upy[i] - t.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
      if (best < 0) {
        t.cd = 0.03;
        continue;
      }
      const d = Math.sqrt(bd) || 1;
      const lead = d / TOWER.projSpd;
      const ax = upx[best] + uvx[best] * lead - t.x;
      const ay = upy[best] + uvy[best] * lead - t.y;
      const al = Math.hypot(ax, ay) || 1;
      t.angle = Math.atan2(ay, ax);
      this.projs.push({
        x: t.x + (ax / al) * 10,
        y: t.y + (ay / al) * 10,
        vx: (ax / al) * TOWER.projSpd,
        vy: (ay / al) * TOWER.projSpd,
        life: (d + 50) / TOWER.projSpd,
        age: 0,
      });
      t.cd = TOWER.cooldown;
    }
  }

  private updateProjectiles(dt: number): void {
    const { upx, upy, uhp, field, projs, bStart, bUnits } = this;
    const HIT2 = (UR + 2.5) * (UR + 2.5);
    for (let p = projs.length - 1; p >= 0; p--) {
      const pr = projs[p];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      pr.age += dt;
      // grace period so shots clear the tower's own blocked footprint
      let dead = pr.life <= 0 || (pr.age > 0.07 && field.blockedPx(pr.x, pr.y));
      if (!dead) {
        const hx = clamp((pr.x / HC) | 0, 0, HCOLS - 1);
        const hy = clamp((pr.y / HC) | 0, 0, HROWS - 1);
        outer: for (let cy = Math.max(0, hy - 1); cy <= Math.min(HROWS - 1, hy + 1); cy++) {
          for (let cx = Math.max(0, hx - 1); cx <= Math.min(HCOLS - 1, hx + 1); cx++) {
            const c = cy * HCOLS + cx, e = bStart[c + 1];
            for (let k = bStart[c]; k < e; k++) {
              const i = bUnits[k];
              if (i >= this.n || uhp[i] <= 0) continue;
              const dx = upx[i] - pr.x, dy = upy[i] - pr.y;
              if (dx * dx + dy * dy < HIT2) {
                uhp[i] -= TOWER.dmg;
                if (uhp[i] <= 0) {
                  this.pushFx(upx[i], upy[i], 0.35, FxKind.Death);
                  this.removeUnit(i);
                  this.kills++;
                } else {
                  this.pushFx(pr.x, pr.y, 0.12, FxKind.Hit);
                }
                dead = true;
                break outer;
              }
            }
          }
        }
      }
      if (dead) {
        projs[p] = projs[projs.length - 1];
        projs.pop();
      }
    }
  }

  private pushFx(x: number, y: number, ttl: number, kind: FxKind): void {
    if (this.effects.length < FX_CAP) this.effects.push({ x, y, age: 0, ttl, kind });
  }
}
