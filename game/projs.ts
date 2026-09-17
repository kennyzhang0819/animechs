/**
 * THE PLAYER'S SHOTS IN FLIGHT, AS LANES.
 *
 * WHY LANES AND NOT RECORDS. A projectile used to be a heap object of some
 * twenty fields in a plain array (types.ts had the interface). The step
 * touches every shot every tick, and on the boards the game is held to
 * (scripts/check.mjs `turrets`: ten thousand whirls, a hundred and forty
 * thousand shells and fragments in the air) that walk WAS the projectiles
 * phase — not the hash sweep, not the hits, the walk itself: one pointer
 * chased per shot into an object the collector had scattered, fifteen
 * fields wide, of which the common tick reads six. Measured with the
 * sweep, the sort and the homing search already cut to what they had to
 * be, whirl still cost 90ns a shot a tick and stood 2ms over its frame.
 * Bodies have been struct-of-arrays from the start for exactly this reason
 * (sim.ts); shots were the last crowd on the field still stored one at a
 * time. As lanes the tick reads contiguous floats, and a shot's death is
 * the tail swapped into its slot on every lane (remove).
 *
 * WHAT A LANE HOLDS is what the record held — the notes below are the
 * record's, moved here with it.
 *
 *   kind        index into TOWER_KINDS (TOWER_KIND_ID) — which tower's
 *               bullet stats drive it; a lane of strings would be a lane
 *               of pointers, and the snapshot ships this index anyway
 *   x y vx vy   px and px a second
 *   life age    seconds left, seconds flown
 *   primeT      flak proximity fuse (Mindustry FlakBulletType): < 0 means
 *   flakT       not primed; once a body strays inside explodeRange it
 *               counts down to boom. flakT is seconds until the next
 *               proximity check
 *   homeT       A HOMING SHOT'S HELD QUARRY (Sim.updateProjectiles): the
 *   homeI       body index it is turning onto, -1 for none, with the uid
 *   homeUid     it had when picked — swap-remove reuses body indices, so
 *               the uid is what says it is still the same body. homeT is
 *               the seconds until the search runs again; a quarry that
 *               dies, leaves range or changes identity re-searches at once
 *   trailT      Bullet.timer(0, ...), the rolling clock the artillery
 *               trail drops its puffs on. Left at 0 by everything else
 *   pierced     Mindustry Bullet.collided: a piercing shot keeps flying
 *               and remembers whom it already hit, so one flame tongue
 *               costs each body exactly one hit however many ticks it
 *               spends inside the hitbox. Body UIDS, not indices. Null on
 *               every shot that does not pierce, which is nearly all of
 *               them — so this one lane stays an array of arrays: a ledger
 *               is a list per shot or nothing
 *   flags       four bits:
 *     PROJ_FRAG   thrown by BulletType.createFrags rather than a barrel:
 *                 its stats are the parent ammo's `frag.bullet`, not the
 *                 turret's own (bulletOf in constants.ts)
 *     PROJ_ALT    thrown by the ODD BARREL of a turret that loads two
 *                 ammos (constants.ts BulletStats.alt — deluge's fire
 *                 nozzle, and nothing else today). Alt first, then frag: a
 *                 fragment of the fire ball is the FIRE ball's child
 *     PROJ_ENEMY  fired by one of the SWARM's conquered turrets: it flies
 *                 past every body and lands on the player's structures by
 *                 the cell it is over (Sim.stepHostileProjectile)
 *     PROJ_BARE   a shot with NO SPRITE OF ITS OWN — torch's flame is the
 *                 only one — whose muzzle effect the pool refused. Such a
 *                 bullet draws nothing at all, the visible weapon being
 *                 Fx.shootSmallFlame at the barrel, so with the flame
 *                 dropped the turret reads as one that tracks and never
 *                 fires. Flagged, the renderer draws the bullet itself as
 *                 one disc on the flame's ramp. False for every bullet with
 *                 a sprite or an orb, and false again the moment the pool
 *                 has room — the real flame is always preferred
 *
 * THE SNAPSHOT (snapshot.ts) copies the drawn lanes straight out of here
 * into its packed Float32Array; the renderer never sees this class.
 */
import { TOWER_KINDS, type TowerKind } from "./types";

/** a tower kind's index into TOWER_KINDS — the `kind` lane's value */
export const TOWER_KIND_ID: Readonly<Record<TowerKind, number>> = Object.fromEntries(
  TOWER_KINDS.map((k, i) => [k, i]),
) as Record<TowerKind, number>;

export const PROJ_FRAG = 1;
export const PROJ_ALT = 2;
export const PROJ_ENEMY = 4;
export const PROJ_BARE = 8;

export class Projs {
  /** shots in flight — every lane is live on [0, n) */
  n = 0;
  x!: Float32Array;
  y!: Float32Array;
  vx!: Float32Array;
  vy!: Float32Array;
  life!: Float32Array;
  age!: Float32Array;
  primeT!: Float32Array;
  flakT!: Float32Array;
  homeT!: Float32Array;
  trailT!: Float32Array;
  homeI!: Int32Array;
  homeUid!: Int32Array;
  kind!: Uint8Array;
  flags!: Uint8Array;
  readonly pierced: (number[] | null)[] = [];

  constructor(cap = 4096) {
    this.grow(cap);
  }

  /**
   * One shot leaving a muzzle or a burst. The fuse starts unprimed, the
   * homing unheld, the clocks at zero; `flakT` is the fuse's first
   * interval (0 on a shot with no fuse). Returns the slot.
   *
   * A PUSH MAY RE-ALLOCATE EVERY LANE (grow): a caller holding a lane in
   * a local across a push is holding the old buffer — see the note at the
   * top of Sim.updateProjectiles.
   */
  push(
    kind: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    flakT: number,
    pierced: number[] | null,
    flags: number,
  ): number {
    if (this.n === this.x.length) this.grow(this.x.length * 2);
    const i = this.n++;
    this.kind[i] = kind;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.age[i] = 0;
    this.primeT[i] = -1;
    this.flakT[i] = flakT;
    this.homeT[i] = 0;
    this.homeI[i] = -1;
    this.homeUid[i] = 0;
    this.trailT[i] = 0;
    this.flags[i] = flags;
    this.pierced[i] = pierced;
    return i;
  }

  /** swap-remove: the tail takes slot `i` on every lane */
  remove(i: number): void {
    const n = --this.n;
    if (i !== n) {
      this.kind[i] = this.kind[n];
      this.x[i] = this.x[n];
      this.y[i] = this.y[n];
      this.vx[i] = this.vx[n];
      this.vy[i] = this.vy[n];
      this.life[i] = this.life[n];
      this.age[i] = this.age[n];
      this.primeT[i] = this.primeT[n];
      this.flakT[i] = this.flakT[n];
      this.homeT[i] = this.homeT[n];
      this.homeI[i] = this.homeI[n];
      this.homeUid[i] = this.homeUid[n];
      this.trailT[i] = this.trailT[n];
      this.flags[i] = this.flags[n];
      this.pierced[i] = this.pierced[n];
    }
    this.pierced[n] = null; // the vacated slot must not pin a ledger
  }

  /** every shot gone — a reset */
  clear(): void {
    for (let i = 0; i < this.n; i++) this.pierced[i] = null;
    this.n = 0;
  }

  private grow(cap: number): void {
    const f = (old?: Float32Array): Float32Array => {
      const a = new Float32Array(cap);
      if (old) a.set(old);
      return a;
    };
    this.x = f(this.x);
    this.y = f(this.y);
    this.vx = f(this.vx);
    this.vy = f(this.vy);
    this.life = f(this.life);
    this.age = f(this.age);
    this.primeT = f(this.primeT);
    this.flakT = f(this.flakT);
    this.homeT = f(this.homeT);
    this.trailT = f(this.trailT);
    const hi = new Int32Array(cap);
    if (this.homeI) hi.set(this.homeI);
    this.homeI = hi;
    const hu = new Int32Array(cap);
    if (this.homeUid) hu.set(this.homeUid);
    this.homeUid = hu;
    const k = new Uint8Array(cap);
    if (this.kind) k.set(this.kind);
    this.kind = k;
    const fl = new Uint8Array(cap);
    if (this.flags) fl.set(this.flags);
    this.flags = fl;
  }
}
