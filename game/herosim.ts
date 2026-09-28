// the hero on the sim's side: one body the player drives, firing the
// turrets' own ammo through the sim's own gun path. See docs/heroes.md
import {
  CELL,
  HC,
  HCOLS,
  HROWS,
  W,
  H,
  clamp,
  structStats,
  type BulletFx,
  type BulletStats,
  type TowerStats,
} from "./constants";
import { FxKind, type RGB, type Tower, type TowerKind } from "./types";
import { HERO_FURNACE_LASER } from "./weapons";
import {
  HERO_CONTACT_DPS,
  HERO_RESPAWN_SECONDS,
  HERO_SPAWN_GRACE,
  type HeroDef,
} from "./heroes";

/** what the rig borrows from the sim — its arrays and the private paths a
 *  shot goes down. Built once by Sim.heroPorts */
export interface HeroPorts {
  readonly upx: Float32Array;
  readonly upy: Float32Array;
  readonly uhp: Float32Array;
  readonly urad: Float32Array;
  readonly ukind: Uint8Array;
  readonly uid: Int32Array;
  readonly bStart: Int32Array;
  readonly bUnits: Int32Array;
  n(): number;
  core(): { x: number; y: number; size: number };
  flying(kind: number): boolean;
  tier(kind: number): number;
  hitR(i: number, dx: number, dy: number, d2: number): number;
  rmax(): number;
  phantom(kind: TowerKind): Tower;
  fire(t: Tower, st: TowerStats, idx: number): void;
  splash(
    x: number, y: number, radius: number, dmg: number,
    burn: number | undefined, poison: number,
  ): void;
  line(
    x: number, y: number, dirx: number, diry: number, len: number,
    hits: number[], dists: number[],
  ): void;
  damage(i: number, raw: number, pierceArmor: boolean, armorMult: number): void;
  burn(i: number, stacks: number): void;
  reap(hits: readonly number[]): void;
  fx(x: number, y: number, ttl: number, kind: FxKind, rot: number, len: number, sides: number): void;
  fxCol(x: number, y: number, ttl: number, kind: FxKind, rot: number, len: number, col: RGB): void;
  bulletFx(kind: BulletFx | undefined, x: number, y: number, rot: number, col?: RGB): void;
}

export const SLOT_PRIMARY = 0;
export const SLOT_SECONDARY = 1;
export const SLOT_DASH = 2;
export const SLOT_ULT = 3;

const ULT_BEAM_LEN = 500;
const ULT_BEAM_TICK = 1 / 12;
const ART_RANGE = 30 * CELL;

export class HeroRig {
  x = 0;
  y = 0;
  aim = 0;
  hp: number;
  readonly hpMax: number;
  dead = false;
  respawnT = 0;
  graceT = 0;
  readonly cd = [0, 0, 0, 0];
  dashT = 0;
  private dashDx = 0;
  private dashDy = 0;
  private dashTrail = 0;
  ultT = 0;
  private ultTick = 0;
  sprintT = 0;
  deaths = 0;

  private mx = 0;
  private my = 0;
  private ax = 0;
  private ay = 0;
  private firing = false;

  private readonly prim: Tower;
  private readonly primSpec: TowerStats;
  private readonly hits: number[] = [];
  private readonly dists: number[] = [];

  constructor(readonly def: HeroDef, private readonly p: HeroPorts) {
    this.hpMax = def.hp;
    this.hp = def.hp;
    this.prim = p.phantom(def.primary.kind);
    const base = structStats(def.primary.kind);
    this.primSpec = {
      ...base,
      reload: def.primary.cooldown,
      shots: def.primary.shots,
      spread: def.primary.spread,
      inaccuracy: def.primary.inaccuracy,
      shootY: def.radius,
      shotDelay: 0,
      range: Math.max(base.range, 300),
    };
    if (def.id === "arc") {
      this.primSpec = { ...this.primSpec, range: 320 };
    }
  }

  reset(): void {
    this.hp = this.hpMax;
    this.dead = false;
    this.respawnT = 0;
    this.graceT = HERO_SPAWN_GRACE;
    this.cd.fill(0);
    this.dashT = this.ultT = this.sprintT = 0;
    this.firing = false;
    this.mx = this.my = 0;
    this.placeAtCore();
  }

  private placeAtCore(): void {
    const c = this.p.core();
    this.x = c.x;
    this.y = c.y + (c.size * CELL) / 2 + 2 * CELL;
    this.ax = this.x;
    this.ay = this.y - 1;
  }

  input(mx: number, my: number, ax: number, ay: number, firing: boolean): void {
    this.mx = clamp(mx, -1, 1);
    this.my = clamp(my, -1, 1);
    this.ax = ax;
    this.ay = ay;
    this.firing = firing;
  }

  update(dt: number): void {
    for (let i = 0; i < 4; i++) if (this.cd[i] > 0) this.cd[i] = Math.max(0, this.cd[i] - dt);
    if (this.dead) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        this.dead = false;
        this.hp = this.hpMax;
        this.graceT = HERO_SPAWN_GRACE;
        this.placeAtCore();
        this.p.fx(this.x, this.y, 0.5, FxKind.Shockwave, 0, 60, 0);
      }
      return;
    }
    if (this.graceT > 0) this.graceT -= dt;
    if (this.sprintT > 0) this.sprintT -= dt;

    if (this.dashT > 0) {
      const step = Math.min(dt, this.dashT);
      const v = this.def.dash.distance / this.def.dash.duration;
      this.moveBy(this.dashDx * v * step, this.dashDy * v * step);
      this.dashT -= step;
      this.dashTrail += v * step;
      while (this.dashTrail >= 32) {
        this.dashTrail -= 32;
        this.trailPuff();
      }
    } else {
      const len = Math.hypot(this.mx, this.my);
      if (len > 0.01) {
        let spd = this.def.speed * (this.sprintT > 0 ? 2 : 1);
        if (this.ultT > 0) spd *= 0.4;
        const k = Math.min(1, len) / len;
        this.moveBy(this.mx * k * spd * dt, this.my * k * spd * dt);
      }
    }
    this.aim = Math.atan2(this.ay - this.y, this.ax - this.x);

    if (this.ultT > 0) this.channelUlt(dt);
    else if (this.firing && this.cd[SLOT_PRIMARY] <= 0) {
      this.cd[SLOT_PRIMARY] = this.def.primary.cooldown;
      this.firePrimary();
    }

    this.contact(dt);
  }

  private moveBy(dx: number, dy: number): void {
    const r = this.def.radius;
    this.x = clamp(this.x + dx, r, W - r);
    this.y = clamp(this.y + dy, r, H - r);
  }

  /** every body touching the hero chews on it, by tier */
  private contact(dt: number): void {
    if (this.graceT > 0) return;
    const { upx, upy, uhp, ukind, bStart, bUnits } = this.p;
    const n = this.p.n();
    const r = this.def.radius;
    const pad = r + this.p.rmax();
    const hx0 = clamp(((this.x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((this.y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((this.x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((this.y + pad) / HC) | 0, 0, HROWS - 1);
    let dps = 0;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= n || uhp[i] <= 0) continue;
        const dx = upx[i] - this.x, dy = upy[i] - this.y;
        const d2 = dx * dx + dy * dy;
        const rr = r + this.p.hitR(i, dx, dy, d2);
        if (d2 < rr * rr) dps += HERO_CONTACT_DPS[this.p.tier(ukind[i])] ?? 50;
      }
    }
    if (dps <= 0) return;
    this.hp -= dps * dt;
    if (this.hp <= 0) this.die();
  }

  private die(): void {
    this.hp = 0;
    this.dead = true;
    this.deaths++;
    this.respawnT = HERO_RESPAWN_SECONDS;
    this.dashT = this.ultT = this.sprintT = 0;
    this.p.fx(this.x, this.y, 0.6, FxKind.Shockwave, 0, 90, 0);
    this.p.fx(this.x, this.y, 0.9, FxKind.Explosion, 0, 0, 1);
  }

  /** a phantom turret stood where the hero is, facing the point */
  private aimAt(t: Tower, tx: number, ty: number, range: number): void {
    let dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d > range && d > 0) {
      dx *= range / d;
      dy *= range / d;
    }
    t.x = this.x;
    t.y = this.y;
    t.angle = d > 0 ? Math.atan2(dy, dx) : this.aim;
    t.aimX = this.x + dx;
    t.aimY = this.y + dy;
    t.targetIdx = -1;
    t.target = -1;
    t.aimShieldTower = -1;
    t.aimTower = null;
    t.aimProp = -1;
  }

  private volley(t: Tower, st: TowerStats): void {
    for (let i = 0; i < st.shots; i++) this.p.fire(t, st, i);
  }

  private firePrimary(): void {
    const t = this.prim, st = this.primSpec;
    this.aimAt(t, this.ax, this.ay, 1e9);
    if (this.def.id === "arc") {
      // the bolt chains from the body nearest the cursor, not nearest the hero
      const first = this.nearest(this.ax, this.ay, 80, st.range);
      if (first >= 0) {
        t.targetIdx = first;
        t.target = this.p.uid[first];
      }
    }
    this.volley(t, st);
  }

  /** the live body nearest (x, y) within `r` of it and within `reach` of the hero */
  private nearest(x: number, y: number, r: number, reach: number): number {
    const { upx, upy, uhp, bStart, bUnits } = this.p;
    const n = this.p.n();
    const pad = r + this.p.rmax();
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    let best = -1, bd = r * r;
    for (let hy = hy0; hy <= hy1; hy++) {
      const row = hy * HCOLS;
      const e = bStart[row + hx1 + 1];
      for (let k = bStart[row + hx0]; k < e; k++) {
        const i = bUnits[k];
        if (i >= n || uhp[i] <= 0) continue;
        const dx = upx[i] - x, dy = upy[i] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= bd) continue;
        const hx = upx[i] - this.x, hy2 = upy[i] - this.y;
        if (hx * hx + hy2 * hy2 > reach * reach) continue;
        bd = d2;
        best = i;
      }
    }
    return best;
  }

  /** slot 1 secondary, 2 dash, 3 ultimate, at the world point the cursor was on */
  cast(slot: number, x: number, y: number): void {
    if (this.dead || slot < 1 || slot > 3) return;
    if (this.cd[slot] > 0) return;
    if (this.ultT > 0 && slot !== SLOT_DASH) return;
    this.ax = x;
    this.ay = y;
    this.aim = Math.atan2(y - this.y, x - this.x);
    switch (slot) {
      case SLOT_SECONDARY:
        this.cd[slot] = this.def.secondary.cooldown;
        this.secondary(x, y);
        return;
      case SLOT_DASH:
        this.cd[slot] = this.def.dash.cooldown;
        this.dash(x, y);
        return;
      case SLOT_ULT:
        this.cd[slot] = this.def.ult.cooldown;
        this.ult(x, y);
        return;
    }
  }

  private spec(kind: TowerKind, over: Partial<TowerStats>, bullet?: Partial<BulletStats>): TowerStats {
    const base = structStats(kind);
    return {
      ...base,
      shootY: this.def.radius,
      shotDelay: 0,
      ...over,
      bullet: bullet ? { ...base.bullet, ...bullet } : base.bullet,
    };
  }

  private secondary(x: number, y: number): void {
    switch (this.def.id) {
      case "blight": {
        const t = this.p.phantom("blighter");
        const st = this.spec("blighter", { shots: 3, spread: (6 * Math.PI) / 180, range: ART_RANGE });
        this.aimAt(t, x, y, ART_RANGE);
        this.volley(t, st);
        return;
      }
      case "pyre": {
        const t = this.p.phantom("cleaver");
        const base = structStats("cleaver").bullet;
        const st = this.spec("cleaver", { shots: 1 }, {
          ray: { length: base.ray!.length * 1.2, cone: (70 * Math.PI) / 180 },
        });
        this.aimAt(t, x, y, 1e9);
        this.volley(t, st);
        return;
      }
      case "arc": {
        const t = this.p.phantom("piercer");
        const base = structStats("piercer").bullet;
        const st = this.spec("piercer", { shots: 1, chargeTime: undefined }, {
          laser: { ...base.laser!, length: 500, pierceCap: 8 },
          lifetime: base.lifetime,
        });
        this.aimAt(t, x, y, 1e9);
        this.volley(t, st);
        return;
      }
      case "gunner": {
        const t = this.p.phantom("lobber");
        const st = this.spec("lobber", { shots: 3, spread: (5 * Math.PI) / 180, range: ART_RANGE });
        this.aimAt(t, x, y, ART_RANGE);
        this.volley(t, st);
        return;
      }
    }
  }

  private dash(x: number, y: number): void {
    const d = this.def.dash;
    switch (this.def.id) {
      case "gunner":
        this.sprintT = d.duration;
        this.p.fx(this.x, this.y, 0.3, FxKind.Shockwave, 0, 40, 0);
        return;
      case "arc": {
        let dx = x - this.x, dy = y - this.y;
        const len = Math.hypot(dx, dy);
        if (len > d.distance) {
          dx *= d.distance / len;
          dy *= d.distance / len;
        }
        this.p.fx(this.x, this.y, 0.35, FxKind.Shockwave, 0, 36, 0);
        this.moveBy(dx, dy);
        this.p.fx(this.x, this.y, 0.35, FxKind.Shockwave, 0, 36, 0);
        return;
      }
      default: {
        // the dash goes where the hero is walking, or at the cursor when standing
        let dx = this.mx, dy = this.my;
        if (Math.hypot(dx, dy) < 0.01) {
          dx = Math.cos(this.aim);
          dy = Math.sin(this.aim);
        }
        const len = Math.hypot(dx, dy) || 1;
        this.dashDx = dx / len;
        this.dashDy = dy / len;
        this.dashT = d.duration;
        this.dashTrail = 0;
        this.trailPuff();
      }
    }
  }

  /** what a dash leaves behind it every few px */
  private trailPuff(): void {
    if (this.def.id === "blight") {
      this.p.splash(this.x, this.y, 48, 0, undefined, 2.5);
      this.p.bulletFx(FxKind.WaterBurst, this.x, this.y, 0, this.def.accent);
    } else if (this.def.id === "pyre") {
      this.p.splash(this.x, this.y, 44, 15, 3, 0);
      this.p.bulletFx(FxKind.FlameHit, this.x, this.y, this.aim, this.def.accent);
    }
  }

  private ult(x: number, y: number): void {
    switch (this.def.id) {
      case "blight": {
        const t = this.p.phantom("drifter");
        const st = this.spec("drifter", { shots: 3, spread: (14 * Math.PI) / 180, range: ART_RANGE });
        this.aimAt(t, x, y, ART_RANGE);
        this.volley(t, st);
        return;
      }
      case "pyre":
        this.ultT = this.def.ult.duration;
        this.ultTick = 0;
        return;
      case "arc": {
        const t = this.p.phantom("railhead");
        const st = this.spec("railhead", { shots: 3, spread: (4 * Math.PI) / 180, inaccuracy: 0 });
        this.aimAt(t, x, y, 1e9);
        this.volley(t, st);
        return;
      }
      case "gunner": {
        const t = this.p.phantom("barrage");
        const st = this.spec("barrage", { shots: 12, spread: (3 * Math.PI) / 180, range: ART_RANGE });
        this.aimAt(t, x, y, ART_RANGE);
        this.volley(t, st);
        return;
      }
    }
  }

  /** the furnace beam, held on the aim: a damage tick twelve times a second */
  private channelUlt(dt: number): void {
    this.ultT -= dt;
    this.ultTick -= dt;
    const b = structStats("furnace").bullet;
    const mz = this.def.radius;
    const ox = this.x + Math.cos(this.aim) * mz, oy = this.y + Math.sin(this.aim) * mz;
    if (this.ultTick <= 0) {
      this.ultTick += ULT_BEAM_TICK;
      const hits = this.hits, dists = this.dists;
      this.p.line(ox, oy, Math.cos(this.aim), Math.sin(this.aim), ULT_BEAM_LEN, hits, dists);
      for (const i of hits) {
        this.p.damage(i, b.damage, b.pierceArmor ?? false, b.armorMultiplier ?? 1);
        if (this.p.uhp[i] > 0) {
          if (b.burn) this.p.burn(i, b.burn);
          this.p.bulletFx(b.hitFx, this.p.upx[i], this.p.upy[i], this.aim, b.fxColor);
        }
      }
      this.p.reap(hits);
    }
    this.p.fx(ox, oy, 2 / 60, FxKind.Laser, this.aim, ULT_BEAM_LEN, HERO_FURNACE_LASER.id);
    if (this.ultT <= 0) this.ultT = 0;
  }
}
