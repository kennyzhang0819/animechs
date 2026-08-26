import { BASE, CELL, clamp, COLS, H, MAX_UNITS, ROWS, TOWERS, W, WALL_R, type TowerStats } from "./constants";
import { FlowField, type Vec2 } from "./flowfield";
import {
  LEVELS,
  UNIT_ID,
  UNIT_KINDS,
  UNIT_RMAX,
  UNIT_STATS,
  type LevelSpec,
  type UnitKind,
} from "./levels";
import { loadMap, terrainFromMap } from "./maps";
import type { TechState } from "./tech";
import { WALL_PINE, type Terrain } from "./terrain";
import { FxKind, TOWER_KINDS, type Effect, type Projectile, type Tower, type TowerKind } from "./types";

const FX_CAP = 400;

// separation personal space (px): units steer apart inside this radius, and
// hard-resolve interpenetration below the pressure floor (see HARD). Bigger
// SEP = airier crowds but lower lane throughput, which caps how many units
// the field can hold at once (throughput ~ speed * strip / SEP^2)
const SEP = 26;
// pressure floor (px): crowds may compress to this spacing but never below.
// It sets crowd density — and with it how many units fit on the field.
// Two daggers (UR 10) touch at 20, so a floor a notch above that keeps
// pressed crowds from shoving units visibly into each other; must stay < SEP
const HARD = 26;
// spatial hash cell size (px); rebuilt every frame with a counting sort.
// must be >= SEP so a 3x3 bucket scan covers the separation radius
const HC = 26;
// narrow-passage centering gain (1/s): in 1-wide corridors and L-bend
// corners, steer toward the cell centerline so units line up with the
// slim (CELL - 2*WALL_R)px window instead of scraping the jambs
const CENTER_K = 25;
const HCOLS = (W / HC) | 0;
const HROWS = (H / HC) | 0;
const HN = HCOLS * HROWS;

export type PlaceResult = "ok" | "invalid" | "would-seal";

// is a unit kind (by numeric id) airborne? towers and bullets check this
// against their targetAir/targetGround and collidesAir/collidesGround flags
const KIND_FLYING: readonly boolean[] = UNIT_KINDS.map((k) => !!UNIT_STATS[k].flying);

// where flyers aim: the core's center in world px — they need no flow field
const GOAL_X = (BASE.x + BASE.size / 2) * CELL;
const GOAL_Y = (BASE.y + BASE.size / 2) * CELL;

// how fast body and chassis swivel: Mindustry's default rotateSpeed /
// baseRotateSpeed, 5 degrees per tick
const ROT_SPD = ((5 * Math.PI) / 180) * 60;

/**
 * The whole simulation: units in struct-of-arrays, a spatial hash for
 * separation and projectile hits, towers, and the flow field they block.
 */
export class Sim {
  readonly field = new FlowField();
  terrain!: Terrain; // assigned by reset() in the constructor

  readonly upx = new Float32Array(MAX_UNITS);
  readonly upy = new Float32Array(MAX_UNITS);
  readonly uvx = new Float32Array(MAX_UNITS);
  readonly uvy = new Float32Array(MAX_UNITS);
  readonly uhp = new Float32Array(MAX_UNITS);
  readonly uhpmax = new Float32Array(MAX_UNITS);
  readonly uspd = new Float32Array(MAX_UNITS);
  readonly urad = new Float32Array(MAX_UNITS);
  readonly uarmor = new Float32Array(MAX_UNITS);
  readonly ukind = new Uint8Array(MAX_UNITS); // UNIT_ID of the kind
  // animation state, sim-owned so it survives swap-remove: distance walked
  // (drives the mech leg cycle), chassis angle, body angle
  readonly uwalk = new Float32Array(MAX_UNITS);
  readonly ubrot = new Float32Array(MAX_UNITS);
  readonly urot = new Float32Array(MAX_UNITS);
  n = 0;

  level: LevelSpec = LEVELS[0];
  totalEnemies = 0;
  kills = 0;
  leaked = 0;
  /** kills per unit kind this run, indexed like UNIT_KINDS — the scrap payout */
  readonly killsByKind = new Int32Array(UNIT_KINDS.length);
  /** every leak chips the core; at zero the run is lost */
  readonly coreHpMax = 10;
  coreHp = this.coreHpMax;
  // which towers may be built and how many of each — null (the default, and
  // the map editor's mode) places no restrictions; the campaign sets it from
  // the save's tech tree before play (see Game.create)
  private tech: TechState | null = null;
  // live per-kind census, updated the moment a unit spawns or is removed
  readonly aliveByKind = new Int32Array(UNIT_KINDS.length);
  // the level script's cursor, plus the live state of the step it points at:
  // a wave counts down per kind, a wait counts down in seconds
  private stepIdx = 0;
  // how many waves the script holds, and how many have begun entering — the
  // HUD's "Wave 2 / 5". A wave stays current through the wait that follows it
  totalWaves = 0;
  private wavesStarted = 0;
  private readonly waveLeft = new Int32Array(UNIT_KINDS.length);
  private readonly waveTotal = new Int32Array(UNIT_KINDS.length);
  private waitLeft = 0;
  private spawnAcc = 0;

  towers: Tower[] = [];
  projs: Projectile[] = [];
  effects: Effect[] = [];

  private readonly bStart = new Int32Array(HN + 1);
  private readonly bCount = new Int32Array(HN);
  private readonly bUnits = new Int32Array(MAX_UNITS);
  private readonly flowTmp: Vec2 = { x: 0, y: 0 };

  // seal-test cache: hover asks canPlace every frame, and the test costs two
  // flow-field recomputes — remember the verdict for the last cell asked
  private sealGx = -1;
  private sealGy = -1;
  private sealResult = false;

  constructor(level?: LevelSpec) {
    if (level) this.level = level;
    this.reset();
  }

  reset(): void {
    this.n = 0;
    this.kills = 0;
    this.leaked = 0;
    this.killsByKind.fill(0);
    this.coreHp = this.coreHpMax;
    this.sealGx = -1;
    this.projs.length = 0;
    this.effects.length = 0;
    this.towers.length = 0;
    // the official map document IS the world: map-editor saves land in its
    // JSON, and the next full page load plays them. The documents are
    // fetched before the sim is built (see Game.create), never imported
    const doc = loadMap(this.level.mapId);
    if (!doc)
      throw new Error(
        `map "${this.level.mapId}" not loaded — await loadOfficialMaps() first (and list it in OFFICIAL_MAP_IDS)`,
      );
    this.terrain = terrainFromMap(doc);
    this.field.rebuildWalk(this.towers, this.terrain.blocked, this.terrain.spawn);
    this.field.compute();
    // fail LOUDLY on a broken map: with zero pads nothing ever spawns and a
    // wave script stalls forever, which reads as a scheduler bug otherwise
    if (this.field.spawnAir.length === 0)
      throw new Error(`map "${doc.id}" has no spawn pads — paint some in the editor`);
    if (this.field.spawnPts.length === 0)
      console.warn(`map "${doc.id}": no spawn pad connects to the core — ground waves will stall`);
    this.totalEnemies = 0;
    this.totalWaves = 0;
    // an empty wave is not a wave — loadStep skips it, so it must not count
    // here either, or the HUD would promise a wave that never arrives
    for (const step of this.level.script) {
      if (!("wave" in step)) continue;
      let n = 0;
      for (const k of UNIT_KINDS) n += step.wave[k] ?? 0;
      if (n === 0) continue;
      this.totalWaves++;
      this.totalEnemies += n;
    }
    this.stepIdx = 0;
    this.waitLeft = 0;
    this.spawnAcc = 0;
    this.wavesStarted = 0;
    this.loadStep();
    this.aliveByKind.fill(0);
  }

  loadLevel(spec: LevelSpec): void {
    this.level = spec;
    this.reset();
  }

  /** campaign restrictions on building; null lifts them (editor, dev) */
  setTech(tech: TechState | null): void {
    this.tech = tech;
  }

  /** enemies left to kill: still unspawned + still walking the field */
  remaining(): number {
    return this.totalEnemies - this.kills - this.leaked;
  }

  /**
   * Where the run stands: lost the moment the core's HP is gone, won once
   * every scripted enemy is dead or leaked with HP to spare.
   */
  outcome(): "playing" | "won" | "lost" {
    if (this.coreHp <= 0) return "lost";
    if (this.totalEnemies > 0 && this.remaining() === 0) return "won";
    return "playing";
  }

  /** live towers per kind — the HUD's "2/6" badges, and the cap check */
  towerCounts(): Record<TowerKind, number> {
    const counts = Object.fromEntries(TOWER_KINDS.map((k) => [k, 0])) as Record<TowerKind, number>;
    for (const t of this.towers) counts[t.kind]++;
    return counts;
  }

  /** per-kind head count currently on the field, indexed like UNIT_KINDS */
  aliveByKindList(): number[] {
    return Array.from(this.aliveByKind);
  }

  /** 1-based number of the wave on the field; a level that opens with a wait
   * still reads "Wave 1" while it counts down to that first wave */
  currentWave(): number {
    return Math.max(1, this.wavesStarted);
  }

  /** seconds until the next wave starts entering, or 0 when one is already
   * draining (or the script has run out) */
  nextWaveIn(): number {
    return this.waitLeft > 0 ? this.waitLeft : 0;
  }

  /** cut the between-waves wait short: the next wave starts entering now.
   * A no-op while a wave is still draining (there is nothing to skip).
   * Must advance the script — during a wait the wave counters are already
   * zero, and runScript reads "no wait + empty wave" as script-finished */
  skipWave(): void {
    if (this.waitLeft <= 0) return;
    this.waitLeft = 0;
    this.nextStep();
  }

  private addTower(gx: number, gy: number, kind: TowerKind): void {
    const sz = TOWERS[kind].size;
    this.towers.push({
      kind,
      gx,
      gy,
      x: (gx + sz / 2) * CELL,
      y: (gy + sz / 2) * CELL,
      cd: Math.random() * 0.1,
      angle: 0,
      burstLeft: 0,
      burstT: 0,
      shotCount: 0,
      aimDist: 0,
    });
  }

  update(dt: number): void {
    this.runScript(dt);

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

  // ---------- level script ----------

  /**
   * Point the live state at script[stepIdx], skipping steps with nothing in
   * them (an empty wave, a zero wait). Leaves everything zeroed once the
   * script runs out, which is what ends the level.
   */
  private loadStep(): void {
    this.waveLeft.fill(0);
    this.waveTotal.fill(0);
    this.waitLeft = 0;
    const script = this.level.script;
    for (; this.stepIdx < script.length; this.stepIdx++) {
      const step = script[this.stepIdx];
      if ("wait" in step) {
        if (step.wait > 0) {
          this.waitLeft = step.wait;
          return;
        }
        continue;
      }
      let any = false;
      for (const k of UNIT_KINDS) {
        const c = step.wave[k] ?? 0;
        if (c <= 0) continue;
        this.waveLeft[UNIT_ID[k]] = c;
        this.waveTotal[UNIT_ID[k]] = c;
        any = true;
      }
      if (any) {
        this.wavesStarted++;
        return;
      }
    }
  }

  /** move to the next step, resetting the drain credit so waves start clean */
  private nextStep(): void {
    this.stepIdx++;
    this.spawnAcc = 0;
    this.loadStep();
  }

  /**
   * Which kind to send next out of the current wave: whichever is furthest
   * from finishing, by fraction of its own total. That intermingles a mixed
   * wave from its first unit and lands every kind's last unit together,
   * instead of emptying one pile before starting the next.
   */
  private nextWaveKind(): number {
    let best = -1;
    let bestFrac = 0;
    for (let i = 0; i < this.waveLeft.length; i++) {
      if (this.waveLeft[i] <= 0) continue;
      const frac = this.waveLeft[i] / this.waveTotal[i];
      if (frac > bestFrac) {
        bestFrac = frac;
        best = i;
      }
    }
    return best;
  }

  /**
   * Run the level script: hold through a wait, otherwise drain the current
   * wave at the level's spawn rate. A failed spawn (the strip is too crowded)
   * leaves the unit in the wave and keeps its drain credit for a later frame,
   * so a packed field delays a wave rather than swallowing it.
   */
  private runScript(dt: number): void {
    if (this.waitLeft > 0) {
      this.waitLeft -= dt;
      if (this.waitLeft > 0) return;
      this.nextStep();
      // a wait that ends this frame hands its leftover time to nothing else;
      // the wave it unblocks starts draining on the next frame
      if (this.waitLeft > 0) return;
    }

    let left = 0;
    for (let i = 0; i < this.waveLeft.length; i++) left += this.waveLeft[i];
    if (left === 0) return; // script finished

    this.spawnAcc = Math.min(this.spawnAcc + this.level.spawnRate * dt, this.level.spawnRate);
    while (left > 0 && this.spawnAcc >= 1) {
      const id = this.nextWaveKind();
      if (id < 0 || !this.spawnUnit(UNIT_KINDS[id])) break;
      this.waveLeft[id]--;
      this.spawnAcc--;
      left--;
    }
    if (left === 0) this.nextStep();
  }

  // ---------- placement ----------

  /** the 2x2 footprint is on the map, off the core, and free of walls */
  private cellsFree(gx: number, gy: number): boolean {
    if (gx < 0 || gy < 0 || gx > COLS - 2 || gy > ROWS - 2) return false;
    const { walk, isGoal } = this.field;
    for (let y = gy; y < gy + 2; y++)
      for (let x = gx; x < gx + 2; x++) {
        const i = y * COLS + x;
        if (walk[i] || isGoal[i]) return false;
      }
    return true;
  }

  /** no unit may be standing on (or overhanging into) the footprint */
  private areaClearOfUnits(gx: number, gy: number): boolean {
    const x0 = gx * CELL, y0 = gy * CELL;
    const x1 = x0 + CELL * 2, y1 = y0 + CELL * 2;
    const hx0 = clamp(((x0 - UNIT_RMAX) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y0 - UNIT_RMAX) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x1 + UNIT_RMAX) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y1 + UNIT_RMAX) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = this.bStart[c + 1];
        for (let k = this.bStart[c]; k < e; k++) {
          const i = this.bUnits[k];
          if (i >= this.n) continue;
          const dx = this.upx[i] - clamp(this.upx[i], x0, x1);
          const dy = this.upy[i] - clamp(this.upy[i], y0, y1);
          if (dx * dx + dy * dy < this.urad[i] * this.urad[i]) return false;
        }
      }
    }
    return true;
  }

  /** would this footprint cut the swarm's last route to the core? */
  private wouldSeal(gx: number, gy: number): boolean {
    if (gx === this.sealGx && gy === this.sealGy) return this.sealResult;
    const sealed = this.field.sealsSpawns(gx, gy);
    this.sealGx = gx;
    this.sealGy = gy;
    this.sealResult = sealed;
    return sealed;
  }

  /**
   * Towers build on HIGHGROUND only: mountain/rock wall cells (not forest,
   * not floor), free of other towers. They overlook the lanes and never
   * touch the flow field — the rock was already unwalkable.
   */
  canPlace(gx: number, gy: number, kind: TowerKind): boolean {
    // tech gate first: a locked tower or an exhausted cap refuses everywhere,
    // so the drag-chain and keyboard paths can't sidestep the menu
    if (this.tech) {
      if (!this.tech.unlocked.has(kind)) return false;
      let count = 0;
      for (const t of this.towers) if (t.kind === kind) count++;
      if (count >= this.tech.caps[kind]) return false;
    }
    const sz = TOWERS[kind].size;
    if (gx < 0 || gy < 0 || gx > COLS - sz || gy > ROWS - sz) return false;
    const { blocked, wall } = this.terrain;
    for (let y = gy; y < gy + sz; y++)
      for (let x = gx; x < gx + sz; x++) {
        const i = y * COLS + x;
        if (!blocked[i] || wall[i] >= WALL_PINE) return false;
      }
    for (const t of this.towers) {
      const tsz = TOWERS[t.kind].size;
      if (gx < t.gx + tsz && t.gx < gx + sz && gy < t.gy + tsz && t.gy < gy + sz)
        return false;
    }
    return true;
  }

  placeTower(gx: number, gy: number, kind: TowerKind): PlaceResult {
    if (!this.canPlace(gx, gy, kind)) return "invalid";
    this.addTower(gx, gy, kind);
    return "ok";
  }

  /**
   * Chain building: walk the drag segment a cell at a time, dropping a tower
   * wherever one fits (overlap with the one just placed fails canPlace,
   * which is what spaces the chain). Returns how many towers landed.
   */
  placeLine(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): number {
    const sz = TOWERS[kind].size;
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / CELL));
    let placed = 0, pgx = -1, pgy = -1;
    for (let s = 0; s <= steps; s++) {
      const gx = clamp(Math.round((x0 + (dx * s) / steps) / CELL - sz / 2), 0, COLS - sz);
      const gy = clamp(Math.round((y0 + (dy * s) / steps) / CELL - sz / 2), 0, ROWS - sz);
      if (gx === pgx && gy === pgy) continue;
      pgx = gx;
      pgy = gy;
      if (this.placeTower(gx, gy, kind) === "ok") placed++;
    }
    return placed;
  }

  /** the tower whose footprint covers the world point, if any */
  towerAt(px: number, py: number): Tower | null {
    const gx = (px / CELL) | 0, gy = (py / CELL) | 0;
    for (const t of this.towers) {
      const sz = TOWERS[t.kind].size;
      if (gx >= t.gx && gx < t.gx + sz && gy >= t.gy && gy < t.gy + sz) return t;
    }
    return null;
  }

  /** remove the tower whose footprint covers the world point, if any */
  sellTowerAt(px: number, py: number): boolean {
    const t = this.towerAt(px, py);
    if (!t) return false;
    this.towers.splice(this.towers.indexOf(t), 1);
    // the rock under it belongs to the mountain — nothing to unblock
    this.pushFx(t.x, t.y, 0.35, FxKind.Death); // demolish puff
    return true;
  }

  /**
   * Future ground-placed structures build on the floor with the full rule
   * set towers used to have: free walkable cells, no units underfoot, and
   * no sealing of the swarm's last route. Blocks the cells and recomputes
   * the flow. Unused today — kept wired for when such structures exist.
   */
  placeGroundStructure(gx: number, gy: number): PlaceResult {
    if (!this.cellsFree(gx, gy) || !this.areaClearOfUnits(gx, gy)) return "invalid";
    if (this.wouldSeal(gx, gy)) return "would-seal";
    const { walk } = this.field;
    for (let y = gy; y < gy + 2; y++)
      for (let x = gx; x < gx + 2; x++) walk[y * COLS + x] = 1;
    this.field.compute();
    this.sealGx = -1; // the wall layout changed; cached verdicts are stale
    this.unstickUnits();
    return "ok";
  }

  // ---------- spawning ----------

  /**
   * A spawn spot is free if no unit from last frame's hash sits on it —
   * keeps the spawn strip from overcrowding, so separation never
   * slingshots units forward.
   */
  private spawnSpotFree(x: number, y: number, r: number, fly: boolean): boolean {
    // the spawner's own radius plus the crowd pressure floor's half-spacing;
    // only units in the same layer count — air and ground never collide
    const need = r + HARD / 2;
    const r2 = need * need;
    const hx = clamp((x / HC) | 0, 0, HCOLS - 1);
    const hy = clamp((y / HC) | 0, 0, HROWS - 1);
    for (let gy = Math.max(0, hy - 1); gy <= Math.min(HROWS - 1, hy + 1); gy++) {
      for (let gx = Math.max(0, hx - 1); gx <= Math.min(HCOLS - 1, hx + 1); gx++) {
        const c = gy * HCOLS + gx, e = this.bStart[c + 1];
        for (let k = this.bStart[c]; k < e; k++) {
          const i = this.bUnits[k];
          if (i >= this.n || KIND_FLYING[this.ukind[i]] !== fly) continue;
          const dx = this.upx[i] - x, dy = this.upy[i] - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
    }
    return true;
  }

  private spawnUnit(kind: UnitKind): boolean {
    const stats = UNIT_STATS[kind];
    const fly = !!stats.flying;
    // every enemy enters on a spawn pad from the terrain's spawn layer;
    // walkers need a pad connected to the core, flyers take any open pad
    const pads = fly ? this.field.spawnAir : this.field.spawnPts;
    if (this.n >= MAX_UNITS || pads.length === 0) return false;
    const r = stats.radius;
    for (let a = 0; a < 8; a++) {
      const ci = pads[(Math.random() * pads.length) | 0];
      // jitter within the pad, but keep the hitbox inside the cell when it
      // fits (a mace is wider than a tile — it spawns pad-centered)
      const j = Math.max(0, CELL / 2 - r - 1);
      const x = ((ci % COLS) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
      const y = (((ci / COLS) | 0) + 0.5) * CELL + (Math.random() * 2 - 1) * j;
      // a big hitbox can overhang the pad into ragged rock beside it
      if ((!fly && this.field.hitsWall(x, y, WALL_R)) || !this.spawnSpotFree(x, y, r, fly)) continue;
      const i = this.n++;
      this.upx[i] = x;
      this.upy[i] = y;
      this.uvx[i] = 0;
      this.uvy[i] = 0;
      this.uhp[i] = stats.hp;
      this.uhpmax[i] = stats.hp;
      this.uspd[i] = stats.speed;
      this.urad[i] = r;
      this.uarmor[i] = stats.armor;
      this.ukind[i] = UNIT_ID[kind];
      // face the way it will walk, with legs mid-cycle at a random phase so
      // a wave doesn't march in lockstep
      const a0 = fly ? Math.atan2(GOAL_Y - y, GOAL_X - x) : 0;
      this.uwalk[i] = Math.random() * 100;
      this.ubrot[i] = a0;
      this.urot[i] = a0;
      this.aliveByKind[UNIT_ID[kind]]++;
      return true;
    }
    return false;
  }

  /** a tower kill: death puff, removal, and the per-kind scrap ledger */
  private killUnit(i: number): void {
    this.killsByKind[this.ukind[i]]++;
    this.pushFx(this.upx[i], this.upy[i], 0.35, FxKind.Death);
    this.removeUnit(i);
    this.kills++;
  }

  private removeUnit(i: number): void {
    this.aliveByKind[this.ukind[i]]--;
    const n = --this.n;
    this.upx[i] = this.upx[n];
    this.upy[i] = this.upy[n];
    this.uvx[i] = this.uvx[n];
    this.uvy[i] = this.uvy[n];
    this.uhp[i] = this.uhp[n];
    this.uhpmax[i] = this.uhpmax[n];
    this.uspd[i] = this.uspd[n];
    this.urad[i] = this.urad[n];
    this.uarmor[i] = this.uarmor[n];
    this.ukind[i] = this.ukind[n];
    this.uwalk[i] = this.uwalk[n];
    this.ubrot[i] = this.ubrot[n];
    this.urot[i] = this.urot[n];
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
    const { upx, upy, uvx, uvy, uspd, ukind, uwalk, ubrot, urot, field, flowTmp, bStart, bUnits } = this;
    const steer = Math.min(1, dt * 8);
    const SEP2 = SEP * SEP;
    // repulsion probes reach 4px past the wall-clearance radius: any longer
    // and the push-off fires while a unit hugs a wall to enter a staggered
    // narrow passage, shoving it back out of the entry window forever
    const PR = WALL_R + 4, REP = 55, SMAX = 70;
    const { isGoal, walk } = field;

    for (let i = this.n - 1; i >= 0; i--) {
      const cx = clamp((upx[i] / CELL) | 0, 0, COLS - 1);
      const cy = clamp((upy[i] / CELL) | 0, 0, ROWS - 1);
      if (isGoal[cy * COLS + cx]) {
        this.pushFx(upx[i], upy[i], 0.4, FxKind.Breach);
        this.removeUnit(i);
        this.leaked++;
        if (this.coreHp > 0) this.coreHp--;
        continue;
      }

      const fly = KIND_FLYING[ukind[i]];
      if (fly) {
        // flyers ignore the maze: aim straight at the core's center
        const gdx = GOAL_X - upx[i], gdy = GOAL_Y - upy[i];
        const gl = Math.hypot(gdx, gdy) || 1;
        uvx[i] += ((gdx / gl) * uspd[i] - uvx[i]) * steer;
        uvy[i] += ((gdy / gl) * uspd[i] - uvy[i]) * steer;
      } else {
        field.sample(upx[i], upy[i], flowTmp);
        uvx[i] += (flowTmp.x * uspd[i] - uvx[i]) * steer;
        uvy[i] += (flowTmp.y * uspd[i] - uvy[i]) * steer;
      }

      // separation from neighbours via the hash: soft steering inside the
      // personal-space radius, plus accumulated hard overlap below the floor.
      // Same forces for both layers, but strictly within a layer — air and
      // ground pass through each other freely
      let sx = 0, sy = 0, px = 0, py = 0;
      const hx = clamp((upx[i] / HC) | 0, 0, HCOLS - 1);
      const hy = clamp((upy[i] / HC) | 0, 0, HROWS - 1);
      for (let gy = Math.max(0, hy - 1); gy <= Math.min(HROWS - 1, hy + 1); gy++) {
        for (let gx = Math.max(0, hx - 1); gx <= Math.min(HCOLS - 1, hx + 1); gx++) {
          const c = gy * HCOLS + gx, e = bStart[c + 1];
          for (let k = bStart[c]; k < e; k++) {
            const j = bUnits[k];
            if (j === i || j >= this.n || KIND_FLYING[ukind[j]] !== fly) continue;
            const dx = upx[i] - upx[j], dy = upy[i] - upy[j];
            const d2 = dx * dx + dy * dy;
            if (d2 > SEP2 || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const push = (SEP - d) / d;
            sx += dx * push;
            sy += dy * push;
            if (d < HARD) {
              const ov = (HARD - d) / d;
              px += dx * ov;
              py += dy * ov;
            }
          }
        }
      }
      let fx = sx * 14, fy = sy * 14;
      const fl = Math.hypot(fx, fy);
      if (fl > SMAX) {
        fx = (fx / fl) * SMAX;
        fy = (fy / fl) * SMAX;
      }

      // everything terrain-flavoured is ground-only: flyers never probe,
      // jitter, or center — walls are scenery beneath them
      if (!fly) {
        // wall repulsion probes: push off nearby walls so corners can't wedge
        // units (in a 1-wide corridor both sides fire and cancel — harmless)
        if (field.blockedPx(upx[i] + PR, upy[i])) fx -= REP;
        if (field.blockedPx(upx[i] - PR, upy[i])) fx += REP;
        if (field.blockedPx(upx[i], upy[i] + PR)) fy -= REP;
        if (field.blockedPx(upx[i], upy[i] - PR)) fy += REP;

        // symmetry-breaking jitter: units contesting a doorway can settle into
        // a perfectly balanced standoff (flow vs separation, a fraction of a
        // pixel outside the opening, forever) — a small random push dissolves
        // such equilibria and disappears under the flow force in open field
        fx += (Math.random() - 0.5) * 14;
        fy += (Math.random() - 0.5) * 14;

        // narrow-passage centering: 1-wide corridors leave only a slim window
        // (unit clearance is WALL_R < CELL/2) — steer onto the cell centerline
        // there. Strictly both-sides-blocked cells only: anything looser (e.g.
        // an L-corner heuristic) also matches convex corners in open ground
        // and would drag passing units into the corner. Corners of narrow
        // bends need no help — the axis-separated slide stops a unit just
        // inside the turn's window and redirects its speed into the turn
        const bL = cx <= 0 || walk[cy * COLS + cx - 1] === 1;
        const bR = cx >= COLS - 1 || walk[cy * COLS + cx + 1] === 1;
        const bU = cy <= 0 || walk[(cy - 1) * COLS + cx] === 1;
        const bD = cy >= ROWS - 1 || walk[(cy + 1) * COLS + cx] === 1;
        if (bL && bR) fx += ((cx + 0.5) * CELL - upx[i]) * CENTER_K;
        if (bU && bD) fy += ((cy + 0.5) * CELL - upy[i]) * CENTER_K;
      }

      // separation/repulsion steer but never exceed the unit's stat speed
      let mvx = uvx[i] + fx, mvy = uvy[i] + fy;
      const ml = Math.hypot(mvx, mvy);
      if (ml > uspd[i]) {
        mvx = (mvx / ml) * uspd[i];
        mvy = (mvy / ml) * uspd[i];
      }

      // hard de-overlap: resolve up to half the interpenetration per frame
      let ox = 0, oy = 0;
      const pl = Math.hypot(px, py);
      if (pl > 1e-6) {
        const amt = Math.min(pl * 0.5, 10);
        ox = (px / pl) * amt;
        oy = (py / pl) * amt;
      }

      // total displacement never exceeds the unit's stat speed: crowd
      // pressure may redirect a unit but can never squeeze it forward
      // faster than it could walk
      let dxT = mvx * dt + ox, dyT = mvy * dt + oy;
      const dl = Math.hypot(dxT, dyT), dmax = uspd[i] * dt;
      if (dl > dmax) {
        dxT = (dxT / dl) * dmax;
        dyT = (dyT / dl) * dmax;
      }

      // axis-separated move with slide-to-contact: a blocked axis advances
      // flush against the wall face rather than rejecting the whole step —
      // all-or-nothing rejection zeroes the axis velocity each frame, and a
      // unit that must shed a corner overlap in sub-pixel steps deadlocks.
      // Contact placement also lands units exactly on a narrow passage's
      // window edge, so 1-wide corridors and their L-bends stay threadable.
      // Only a zero-progress axis redirects its speed into the free one, and
      // a unit already overlapping a wall (crowd shoves) skips the veto
      // entirely so it can always walk back out. Flyers skip walls wholesale
      const x0 = upx[i], y0 = upy[i];
      const wedged = fly || field.hitsWall(upx[i], upy[i], WALL_R);
      let nx = upx[i] + dxT;
      if (!wedged && field.hitsWall(nx, upy[i], WALL_R)) {
        const cX =
          dxT > 0
            ? Math.floor((nx + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((nx - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dxT > 0 ? cX > upx[i] : cX < upx[i];
        if (fwd && !field.hitsWall(cX, upy[i], WALL_R)) nx = cX;
        else {
          nx = upx[i];
          uvy[i] += Math.sign(uvy[i] || flowTmp.y || 1) * Math.abs(uvx[i]) * 0.6;
          uvx[i] = 0;
        }
      }
      let ny = upy[i] + dyT;
      if (!wedged && field.hitsWall(nx, ny, WALL_R)) {
        const cY =
          dyT > 0
            ? Math.floor((ny + WALL_R) / CELL) * CELL - WALL_R
            : Math.ceil((ny - WALL_R) / CELL) * CELL + WALL_R;
        const fwd = dyT > 0 ? cY > upy[i] : cY < upy[i];
        if (fwd && !field.hitsWall(nx, cY, WALL_R)) ny = cY;
        else {
          ny = upy[i];
          uvx[i] += Math.sign(uvx[i] || flowTmp.x || 1) * Math.abs(uvy[i]) * 0.6;
          uvy[i] = 0;
        }
      }
      upx[i] = clamp(nx, WALL_R, W - WALL_R);
      upy[i] = clamp(ny, WALL_R, H - WALL_R);

      // animation state from what actually happened this frame: legs cycle
      // with distance covered; the body turns toward travel at its steady
      // rate while the chassis (Mindustry baseRotation) only turns as fast
      // as the unit is really moving — shoved units swivel feet-last
      const mdx = upx[i] - x0, mdy = upy[i] - y0;
      const len = Math.hypot(mdx, mdy);
      if (len > 1e-4) {
        const ang = Math.atan2(mdy, mdx);
        urot[i] += clamp(Sim.angleDiff(urot[i], ang), -ROT_SPD * dt, ROT_SPD * dt);
        if (!fly) {
          uwalk[i] += len;
          const cap = ROT_SPD * Math.min(1, len / (uspd[i] * dt)) * dt;
          ubrot[i] += clamp(Sim.angleDiff(ubrot[i], ang), -cap, cap);
        }
      }
    }
  }

  /** push units out of freshly blocked cells (after tower placement) */
  private unstickUnits(): void {
    const { upx, upy, ukind, field } = this;
    for (let i = 0; i < this.n; i++) {
      // flyers are allowed over walls — never teleport them off a mountain
      if (KIND_FLYING[ukind[i]] || !field.hitsWall(upx[i], upy[i], WALL_R)) continue;
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

  /** smallest signed difference a -> b in radians */
  private static angleDiff(a: number, b: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /**
   * The Turret.java loop: reload runs regardless of targeting, queued volley
   * shots fire on their shotDelay timers at the turret's current rotation,
   * the barrel turns toward the intercept point at rotateSpeed, and a new
   * volley starts only when aimed within shootCone of the target.
   */
  private fireTowers(dt: number): void {
    const { upx, upy, uvx, uvy } = this;
    for (const t of this.towers) {
      const st = TOWERS[t.kind];
      if (t.cd > 0) t.cd -= dt;

      // shots already queued by a volley fire even if the target moved/died
      if (t.burstLeft > 0) {
        t.burstT -= dt;
        while (t.burstLeft > 0 && t.burstT <= 0) {
          this.fireShot(t, st, st.shots - t.burstLeft);
          t.burstLeft--;
          t.burstT += st.shotDelay;
        }
      }

      let best = -1, bd = st.range * st.range;
      for (let i = 0; i < this.n; i++) {
        // air-only turrets ignore the ground swarm and vice versa
        if (KIND_FLYING[this.ukind[i]] ? !st.targetAir : !st.targetGround) continue;
        const dx = upx[i] - t.x, dy = upy[i] - t.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) {
          bd = d2;
          best = i;
        }
      }
      if (best < 0) continue;

      // Predict.intercept: aim where target and bullet paths cross. Hitscan
      // bullets (speed ~0) aim straight at the target, like Mindustry's
      // predictTarget guard (bullet.speed >= 0.01 or no lead at all)
      const dx = upx[best] - t.x, dy = upy[best] - t.y;
      let aimX = dx, aimY = dy;
      if (st.bullet.speed >= 1) {
        const tvx = uvx[best], tvy = uvy[best];
        const s2 = st.bullet.speed * st.bullet.speed;
        const qa = tvx * tvx + tvy * tvy - s2;
        const qb = 2 * (dx * tvx + dy * tvy);
        const qc = dx * dx + dy * dy;
        let lead = Math.sqrt(qc) / st.bullet.speed; // fallback: current distance
        if (Math.abs(qa) > 1e-4) {
          const disc = qb * qb - 4 * qa * qc;
          if (disc >= 0) {
            const root = (-qb - Math.sqrt(disc)) / (2 * qa);
            if (root > 0) lead = root;
          }
        } else if (Math.abs(qb) > 1e-4) {
          const root = -qc / qb;
          if (root > 0) lead = root;
        }
        aimX = dx + tvx * lead;
        aimY = dy + tvy * lead;
      }
      const targetRot = Math.atan2(aimY, aimX);

      const diff = Sim.angleDiff(t.angle, targetRot);
      const turn = st.rotateSpeed * dt;
      t.angle = Math.abs(diff) <= turn ? targetRot : t.angle + Math.sign(diff) * turn;

      if (t.cd <= 0 && Math.abs(Sim.angleDiff(t.angle, targetRot)) < st.shootCone) {
        t.cd += st.reload; // reloadCounter %= reload
        t.burstLeft = st.shots;
        t.burstT = 0;
        t.aimDist = Math.hypot(aimX, aimY); // artillery lands its shells here
        // shots with no shotDelay (a ShootSpread fan) all leave this frame
        while (t.burstLeft > 0 && t.burstT <= 0) {
          this.fireShot(t, st, st.shots - t.burstLeft);
          t.burstLeft--;
          t.burstT += st.shotDelay;
        }
      }
    }
  }

  /**
   * One bullet at the turret's rotation plus the volley's ShootSpread fan
   * offset and the per-shot inaccuracy. Hitscan rays (fuse shrapnel) damage
   * instantly and leave only their animation; the rest spawn projectiles.
   */
  private fireShot(t: Tower, st: TowerStats, idx: number): void {
    const fan = (idx - (st.shots - 1) / 2) * st.spread;
    const a = t.angle + fan + (Math.random() * 2 - 1) * st.inaccuracy;
    const cos = Math.cos(a), sin = Math.sin(a);
    const muzzle = st.size * 5; // scales the old 10px offset with the block
    let x = t.x + cos * muzzle, y = t.y + sin * muzzle;
    if (st.barrels) {
      // ShootAlternate: the mount point steps sideways barrel to barrel,
      // perpendicular to the turret's facing (not the inaccuracy-jittered a)
      const bi = (t.shotCount % st.barrels.count) - (st.barrels.count - 1) / 2;
      const off = bi * st.barrels.spread;
      x += -Math.sin(t.angle) * off;
      y += Math.cos(t.angle) * off;
    }
    t.shotCount++;
    if (st.bullet.ray) {
      this.hitscanRay(
        x,
        y,
        a,
        st.bullet.ray.length,
        st.bullet.damage,
        st.bullet.collidesAir,
        st.bullet.collidesGround,
      );
      this.pushFx(x, y, st.bullet.lifetime, FxKind.Shrapnel, a, st.bullet.ray.length);
      return;
    }
    // Mindustry scaleLife: an artillery shell's lifetime shrinks to the
    // predicted impact distance, so it despawns — and blasts — on target
    const life = st.bullet.artillery
      ? st.bullet.lifetime * clamp(t.aimDist / st.range, 0.1, 1)
      : st.bullet.lifetime;
    this.projs.push({
      kind: t.kind,
      x,
      y,
      vx: cos * st.bullet.speed,
      vy: sin * st.bullet.speed,
      life,
      age: 0,
      primeT: -1,
      flakT: st.bullet.flak ? st.bullet.flak.interval : 0,
    });
  }

  /**
   * Instant piercing ray (Mindustry Damage.collideLine): every unit whose
   * hitbox — grown by collideLine's 3-unit expand — touches the segment
   * takes the full damage; no pierce cap, and terrain never blocks it.
   */
  private hitscanRay(
    x: number,
    y: number,
    angle: number,
    length: number,
    dmg: number,
    air: boolean,
    ground: boolean,
  ): void {
    const { upx, upy, uhp, uarmor, urad, ukind, bStart, bUnits, splashHits } = this;
    const EXPAND = 7.5; // collideLine's expand = 3 world units
    const dirx = Math.cos(angle), diry = Math.sin(angle);
    const x2 = x + dirx * length, y2 = y + diry * length;
    const pad = UNIT_RMAX + EXPAND;
    const hx0 = clamp(((Math.min(x, x2) - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((Math.min(y, y2) - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((Math.max(x, x2) + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((Math.max(y, y2) + pad) / HC) | 0, 0, HROWS - 1);
    splashHits.length = 0;
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
          const i = bUnits[k];
          if (i >= this.n || uhp[i] <= 0) continue;
          if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
          // distance from the unit to the ray segment
          const tt = clamp((upx[i] - x) * dirx + (upy[i] - y) * diry, 0, length);
          const dx = upx[i] - (x + dirx * tt), dy = upy[i] - (y + diry * tt);
          const rr = urad[i] + EXPAND;
          if (dx * dx + dy * dy < rr * rr) splashHits.push(i);
        }
      }
    }
    for (const i of splashHits) {
      uhp[i] -= Sim.applyArmor(dmg, uarmor[i]);
      if (uhp[i] > 0) this.pushFx(upx[i], upy[i], 0.12, FxKind.Hit);
    }
    splashHits.sort((a2, b2) => b2 - a2);
    for (const i of splashHits) {
      if (uhp[i] > 0) continue;
      this.killUnit(i);
    }
  }

  /** Mindustry Damage.applyArmor: flat reduction, floored at 10% of the raw hit */
  private static applyArmor(dmg: number, armor: number): number {
    return Math.max(dmg - armor, 0.1 * dmg);
  }

  private updateProjectiles(dt: number): void {
    const { upx, upy, uhp, uarmor, urad, projs, bStart, bUnits } = this;
    for (let p = projs.length - 1; p >= 0; p--) {
      const pr = projs[p];
      const b = TOWERS[pr.kind].bullet;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      pr.age += dt;

      // flak proximity fuse: check every interval; an enemy inside
      // explodeRange (+ its hitbox) primes the shell, which detonates
      // explodeDelay later while continuing to fly
      if (b.flak && pr.primeT < 0) {
        pr.flakT -= dt;
        if (pr.flakT <= 0) {
          pr.flakT += b.flak.interval;
          if (this.anyUnitWithin(pr.x, pr.y, b.flak.explodeRange, b.collidesAir, b.collidesGround)) {
            pr.primeT = b.flak.explodeDelay;
          }
        }
      }
      if (pr.primeT >= 0) {
        pr.primeT -= dt;
        if (pr.primeT <= 0) pr.life = 0;
      }

      // shots come from elevated towers and arc over terrain — they never
      // collide with rock, only with units or their range-capped life.
      // Artillery shells overfly units too: they only die on target, where
      // the splash below is their whole damage
      let dead = pr.life <= 0;
      if (!dead && !b.artillery) {
        const hx = clamp((pr.x / HC) | 0, 0, HCOLS - 1);
        const hy = clamp((pr.y / HC) | 0, 0, HROWS - 1);
        outer: for (let cy = Math.max(0, hy - 1); cy <= Math.min(HROWS - 1, hy + 1); cy++) {
          for (let cx = Math.max(0, hx - 1); cx <= Math.min(HCOLS - 1, hx + 1); cx++) {
            const c = cy * HCOLS + cx, e = bStart[c + 1];
            for (let k = bStart[c]; k < e; k++) {
              const i = bUnits[k];
              if (i >= this.n || uhp[i] <= 0) continue;
              if (KIND_FLYING[this.ukind[i]] ? !b.collidesAir : !b.collidesGround) continue;
              const dx = upx[i] - pr.x, dy = upy[i] - pr.y;
              const hr = urad[i] + 2.5;
              if (dx * dx + dy * dy < hr * hr) {
                uhp[i] -= Sim.applyArmor(b.damage, uarmor[i]);
                if (uhp[i] <= 0) {
                  this.killUnit(i);
                } else if (b.splash <= 0) {
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
        // splash bullets blast wherever they die: direct hit, proximity
        // fuse, or end of lifetime (Mindustry's despawnHit)
        if (b.splash > 0)
          this.splash(pr.x, pr.y, b.splashRadius, b.splash, b.collidesAir, b.collidesGround);
        projs[p] = projs[projs.length - 1];
        projs.pop();
      }
    }
  }

  /** is any live targetable unit's hitbox within r of (x, y)? */
  private anyUnitWithin(x: number, y: number, r: number, air: boolean, ground: boolean): boolean {
    const { upx, upy, uhp, urad, ukind, bStart, bUnits } = this;
    const pad = r + UNIT_RMAX;
    const hx0 = clamp(((x - pad) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - pad) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + pad) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + pad) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
          const i = bUnits[k];
          if (i >= this.n || uhp[i] <= 0) continue;
          if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
          const dx = upx[i] - x, dy = upy[i] - y;
          const rr = r + urad[i];
          if (dx * dx + dy * dy < rr * rr) return true;
        }
      }
    }
    return false;
  }

  private readonly splashHits: number[] = [];

  /**
   * Area damage with Mindustry's falloff (Damage.calculateDamage): full at
   * the blast center easing to 40% at the radius edge; anything whose
   * hitbox overlaps the radius is affected, armor applying per victim.
   */
  private splash(
    x: number,
    y: number,
    radius: number,
    dmg: number,
    air: boolean,
    ground: boolean,
  ): void {
    const { upx, upy, uhp, uarmor, urad, ukind, bStart, bUnits, splashHits } = this;
    splashHits.length = 0;
    const reach = radius + UNIT_RMAX;
    const hx0 = clamp(((x - reach) / HC) | 0, 0, HCOLS - 1);
    const hy0 = clamp(((y - reach) / HC) | 0, 0, HROWS - 1);
    const hx1 = clamp(((x + reach) / HC) | 0, 0, HCOLS - 1);
    const hy1 = clamp(((y + reach) / HC) | 0, 0, HROWS - 1);
    for (let hy = hy0; hy <= hy1; hy++) {
      for (let hx = hx0; hx <= hx1; hx++) {
        const c = hy * HCOLS + hx, e = bStart[c + 1];
        for (let k = bStart[c]; k < e; k++) {
          const i = bUnits[k];
          if (i >= this.n || uhp[i] <= 0) continue;
          if (KIND_FLYING[ukind[i]] ? !air : !ground) continue;
          const dx = upx[i] - x, dy = upy[i] - y;
          const rr = radius + urad[i];
          if (dx * dx + dy * dy < rr * rr) splashHits.push(i);
        }
      }
    }
    // damage first (indices stay stable), then remove the dead from the
    // highest index down so swap-remove can't disturb pending removals
    for (const i of splashHits) {
      const d = Math.hypot(upx[i] - x, upy[i] - y);
      const raw = dmg * Math.max(0, 0.4 + 0.6 * (1 - d / radius));
      uhp[i] -= Sim.applyArmor(raw, uarmor[i]);
    }
    splashHits.sort((a, b) => b - a);
    for (const i of splashHits) {
      if (uhp[i] > 0) continue;
      this.killUnit(i);
    }
    this.pushFx(x, y, 0.3, FxKind.Flak);
  }

  private pushFx(x: number, y: number, ttl: number, kind: FxKind, rot = 0, len = 0): void {
    if (this.effects.length < FX_CAP) this.effects.push({ x, y, age: 0, ttl, kind, rot, len });
  }
}
