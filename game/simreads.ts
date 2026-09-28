/**
 * WHAT THE GAME SEES OF THE WORLD, wherever the world is.
 *
 * The third side of the seam (commands are simhost.ts, the picture is
 * simview.ts): the game logic and the HUD read the sim through this and
 * only this. It is fed by whichever host is running — the local one
 * writes it from the sim directly, the worker one from what came across
 * — and Game cannot tell which, because nothing here is a call into a
 * Sim. Four kinds of thing live here, each with its own way of crossing:
 *
 *   THE FLAT ARRAYS, by reference, on shared memory (snapshot.ts
 *   FlatWorld). Taken once at the level's birth.
 *
 *   THE HEADER, also by reference: the scalars, a slot each (simreport.ts
 *   HDR). The getters below are one load apiece and never a frame stale.
 *
 *   THE SNAPSHOT AND THE REPORT, which arrive whole once a publish (take):
 *   the object half of the picture, and the answers that are not a number.
 *
 *   THE LEVEL'S OWN CONSTANTS — the terrain, the routes, the taxed cells —
 *   built or taken once, because a level does not change under a run.
 *
 * THE SPEC TABLE IS COPIED, NOT ASKED FOR. A bullet is drawn with the
 * stats it was fired with, which is the live composed table and not the
 * static one, and the renderer asks for it once a projectile. So the
 * table is held here and refreshed when the report says it moved.
 */
import { COLS, structStats, type BulletStats, type TowerStats } from "./constants";
import type { LevelSpec } from "./levels";
import { loadMap, OFFICIAL_MAPS, terrainFromMap } from "./maps";
import { levelWithMarks } from "./missions";
import type { RelicId } from "./relics";
import type { BoardBodies, BoardGrids } from "./board";
import { emptySnapshot, type FlatWorld, type Snapshot } from "./snapshot";
import { HDR, type WorldReport } from "./simreport";
import { closePropCells, hillMask, isBuildableWall, openPropCells, type Prop, type Terrain } from "./terrain";
import { PROP_KINDS } from "./propArt";
import { TOWER_KINDS, type TowerKind } from "./types";

/** everything a World is stood up from — the host gathers it from wherever the sim is */
export interface WorldSource {
  readonly level: LevelSpec;
  readonly flat: FlatWorld;
  readonly header: Float64Array;
  /** the spatial hash a placement reads bodies through (board.ts) */
  readonly bStart: Int32Array;
  readonly bUnits: Int32Array;
  /** the two grids a placement reads that the sim writes: the core's cells
   *  and the occupancy shadow (the rest are the terrain's own) */
  readonly isGoal: Uint8Array;
  readonly occupied: Uint8Array;
  readonly waterlogged: Uint8Array | null;
  readonly airRoutes: readonly { pts: readonly number[] }[];
}

const emptyReport = (): WorldReport => ({
  objectives: [],
  counts: Object.fromEntries(TOWER_KINDS.map((k) => [k, 0])) as Record<TowerKind, number>,
  mods: [],
  relics: [],
  inspect: null,
  specs: null,
  terrain: null,
  propHurt: [],
  profile: null,
});

export interface HeroRead {
  x: number;
  y: number;
  aim: number;
  hp: number;
  hpMax: number;
  /** seconds until the hero stands back up; 0 while alive */
  respawn: number;
  /** seconds left on primary, secondary, dash, ult */
  cd: [number, number, number, number];
  dashT: number;
  ultT: number;
  sprintT: number;
  grace: number;
  deaths: number;
}

export class World {
  readonly level: LevelSpec;
  /** built here from the same map document the sim built its own from */
  readonly terrain: Terrain;
  readonly flat: FlatWorld;
  readonly header: Float64Array;
  readonly bodies: BoardBodies;
  readonly waterlogged: Uint8Array | null;
  readonly airRoutes: readonly { pts: readonly number[] }[];
  private readonly isGoal: Uint8Array;
  private readonly occupied: Uint8Array;

  snapshot: Snapshot = emptySnapshot();
  report: WorldReport = emptyReport();
  /** the relics the run holds, as the roll and the odds read them */
  relicsHeld: ReadonlySet<RelicId> = new Set();
  /**
   * The admin view's bottomless purse (Sim.setRich). Mirrored so that
   * `spend` below can answer the way the sim will: nothing is deducted.
   */
  rich = false;

  private readonly specs = new Map<TowerKind, TowerStats>();
  /** the table version the copy above was taken at (simreport.ts) */
  specsSeen = -1;
  /** the ground version this copy of the terrain is at (simreport.ts TERRAIN) */
  terrainSeen = -1;
  /** the map's props as loaded, the index space the sim's kill list is in */
  private propsAll: readonly Prop[] = [];
  private deadProps = new Set<number>();
  /** the props that came down since the last take, for the picture to
   *  take out one by one (renderer.killProp), and whether any came BACK —
   *  a reset — which is the one case the whole terrain is rebuilt for */
  readonly propsJustDied: Prop[] = [];
  propsRevived = false;
  /** what is left of every prop, by the map's index — 1 until hurt — and
   *  the hurt ones as the sim listed them this frame (the bars) */
  propFrac: Float32Array = new Float32Array(0);
  propHurt: number[] = [];
  get allProps(): readonly Prop[] { return this.propsAll; }
  isPropDead(k: number): boolean { return this.deadProps.has(k); }

  constructor(src: WorldSource) {
    const doc = (src.level.map ? loadMap(src.level.map) : null) ?? OFFICIAL_MAPS[0];
    if (!doc) throw new Error("official maps not loaded — await loadOfficialMaps() first");
    this.terrain = terrainFromMap(doc);
    this.propsAll = this.terrain.props;
    this.propFrac = new Float32Array(this.propsAll.length).fill(1);
    // the same substitution the sim makes on its own copy (Sim.reset): a
    // raze played on a map that carries batteries is played on THOSE, and
    // the two sides have to agree about how many guns that is
    this.level = levelWithMarks(src.level, this.terrain.marks);
    this.flat = src.flat;
    this.header = src.header;
    this.isGoal = src.isGoal;
    this.occupied = src.occupied;
    this.waterlogged = src.waterlogged;
    this.airRoutes = src.airRoutes;
    const h = src.header, f = src.flat;
    this.bodies = {
      get n() {
        return h[HDR.N];
      },
      upx: f.upx,
      upy: f.upy,
      urot: f.urot,
      urad: f.urad,
      ukind: f.ukind,
      bStart: src.bStart,
      bUnits: src.bUnits,
    };
  }

  /** a published frame: the picture's object half and the report behind it */
  take(snapshot: Snapshot, report: WorldReport): void {
    this.snapshot = snapshot;
    this.report = report;
    if (report.specs) {
      this.specs.clear();
      for (const [k, s] of report.specs) this.specs.set(k, s);
      this.specsSeen = this.header[HDR.SPECS];
    }
    // THE GROUND, CAUGHT UP IN PLACE: this copy is held by reference (the
    // draw view, the placement grids), so its cells are edited, never
    // swapped. Props back from an earlier list are a reset's — they close
    // again; the new dead open, by the same rule the sim used (terrain.ts)
    if (report.terrain) {
      const dead = new Set(report.terrain);
      for (const k of this.deadProps)
        if (!dead.has(k)) {
          closePropCells(this.terrain, this.propsAll[k]);
          this.propsRevived = true;
        }
      for (const k of dead)
        if (!this.deadProps.has(k)) {
          openPropCells(this.terrain, this.propsAll[k]);
          this.propsJustDied.push(this.propsAll[k]);
        }
      this.deadProps = dead;
      this.terrain.props = this.propsAll.filter((_, k) => !dead.has(k));
      // the placement mask follows, cell by cell: a dead prop's rock is
      // buildable, a revived prop's is not
      if (this.hillMem) {
        const T = this.terrain, m = this.hillMem;
        const touch = (p: Prop, on: boolean): void => {
          const n = PROP_KINDS[p.kind]?.tiles ?? 1;
          for (let y = p.y; y < p.y + n; y++)
            for (let x = p.x; x < p.x + n; x++) {
              const i = y * COLS + x;
              m[i] = on && T.blocked[i] !== 0 && isBuildableWall(T.wall[i]) ? 1 : 0;
            }
        };
        for (const p of this.propsJustDied) touch(p, true);
        if (this.propsRevived) for (const k of dead) touch(this.propsAll[k], false);
        if (this.propsRevived) for (let k = 0; k < this.propsAll.length; k++) if (!dead.has(k)) touch(this.propsAll[k], false);
      }
      this.terrainSeen = this.header[HDR.TERRAIN];
    }
    for (let i = 0; i < this.propHurt.length; i += 2) this.propFrac[this.propHurt[i]] = 1;
    this.propHurt = report.propHurt;
    for (let i = 0; i < this.propHurt.length; i += 2) this.propFrac[this.propHurt[i]] = this.propHurt[i + 1];
    this.relicsHeld = new Set(report.relics);
  }

  // ---- the header ----

  get time(): number {
    return this.header[HDR.TIME];
  }
  get n(): number {
    return this.header[HDR.N];
  }
  get fxN(): number {
    return this.header[HDR.FXN];
  }
  get kills(): number {
    return this.header[HDR.KILLS];
  }
  get scrap(): number {
    return this.header[HDR.SCRAP];
  }
  get scrapEarned(): number {
    return this.header[HDR.SCRAP_EARNED];
  }
  get deadline(): number {
    return this.header[HDR.DEADLINE];
  }
  get totalWaves(): number {
    return this.header[HDR.TOTAL_WAVES];
  }
  get placed(): number {
    return this.header[HDR.PLACED];
  }
  get lost(): boolean {
    return this.header[HDR.LOST] !== 0;
  }
  get won(): boolean {
    return this.header[HDR.WON] !== 0;
  }
  get remaining(): number {
    return this.header[HDR.REMAINING];
  }
  get currentWave(): number {
    return this.header[HDR.CURRENT_WAVE];
  }
  get nextWaveIn(): number {
    return this.header[HDR.NEXT_WAVE_IN];
  }
  get wavesCleared(): number {
    return this.header[HDR.WAVES_CLEARED];
  }
  /** THE INTERCEPT MISSION'S LEDGER (levels.ts InterceptMission) — what
   *  the objective panel counts. Zero on every other mission */
  get crossKilled(): number {
    return this.header[HDR.CROSS_KILLED];
  }
  get crossLeaked(): number {
    return this.header[HDR.CROSS_LEAKED];
  }
  get crossLive(): number {
    return this.header[HDR.CROSS_LIVE];
  }
  /** THE RAZE MISSION'S LEDGER (levels.ts RazeMission) — emplacements
   *  destroyed, and how many are still firing on the core. Zero on every
   *  other mission */
  get razeKilled(): number {
    return this.header[HDR.RAZE_KILLED];
  }
  get razeUp(): number {
    return this.header[HDR.RAZE_UP];
  }
  /** the sweep's ledger (levels.ts SweepMission): houses down, and houses
   *  the map drew. Zero on every other mission */
  get fabKilled(): number {
    return this.header[HDR.FAB_KILLED];
  }
  get fabTotal(): number {
    return this.header[HDR.FAB_TOTAL];
  }
  /** which garrison circles are still held, one bit per mark in document
   *  order (Sim.garrisonHeldMask) */
  get garrisonHeld(): number {
    return this.header[HDR.GARRISON_HELD];
  }
  /** the side sites (sites.ts): caches opened, every state packed two bits each */
  get sitesOpened(): number {
    return this.header[HDR.SITES_OPENED];
  }
  siteState(i: number): number {
    return Math.floor(this.header[HDR.SITE_STATES] / 4 ** i) % 4;
  }
  /** THE ESCORT MISSION'S LEDGER (levels.ts EscortMission) — carts
   *  delivered and lost, how far the one on the road has got, how many
   *  halts it still has to make, and whether it is standing at one. Zero
   *  on every other mission */
  get convoyDone(): number {
    return this.header[HDR.CONVOY_DONE];
  }
  get convoyLost(): number {
    return this.header[HDR.CONVOY_LOST];
  }
  get convoyAt(): number {
    return this.header[HDR.CONVOY_AT];
  }
  get convoyHalts(): number {
    return this.header[HDR.CONVOY_HALTS];
  }
  get convoyHalted(): boolean {
    return this.header[HDR.CONVOY_HALTED] !== 0;
  }
  /** how far through its objective the run is, 0 to 1 (Sim.missionProgress)
   *  — whichever mission the map carries */
  get missionProgress(): number {
    return this.header[HDR.MISSION_PROGRESS];
  }
  /** how many times the tide has turned (Sim.loopCycle): the swarm's health
   *  is 2^this, and 0 means the script is still on its first pass */
  get loopCycle(): number {
    return this.header[HDR.LOOP_CYCLE];
  }
  /** the authored script's wave count, which the tide never moves */
  get scriptWaves(): number {
    return this.header[HDR.SCRIPT_WAVES];
  }
  /** is building charged? (Sim.charging) */
  get charging(): boolean {
    return this.header[HDR.CHARGING] !== 0;
  }
  /** the body the last tap marked, by slot, or -1 (Sim.inspectedUnit) */
  get inspectedUnit(): number {
    return this.header[HDR.INSPECTED_UNIT];
  }

  /**
   * CAN THE RUN PAY, answered the way Sim.spend will — and the purse
   * debited HERE, at once, so that two purchases in one frame do not both
   * read the balance the first one has already spent. The sim writes the
   * true balance back over this on its next publish; between the two the
   * difference is exactly the commands in flight, which is what a mirror
   * is for. The command itself still goes through the host.
   */
  /** the hero's live numbers (herosim.ts), or null on a run without one */
  get hero(): HeroRead | null {
    const h = this.header;
    if (h[HDR.HERO_ON] === 0) return null;
    return {
      x: h[HDR.HERO_X],
      y: h[HDR.HERO_Y],
      aim: h[HDR.HERO_AIM],
      hp: h[HDR.HERO_HP],
      hpMax: h[HDR.HERO_HPMAX],
      respawn: h[HDR.HERO_RESPAWN],
      cd: [h[HDR.HERO_CD0], h[HDR.HERO_CD1], h[HDR.HERO_CD2], h[HDR.HERO_CD3]],
      dashT: h[HDR.HERO_DASH_T],
      ultT: h[HDR.HERO_ULT_T],
      sprintT: h[HDR.HERO_SPRINT_T],
      grace: h[HDR.HERO_GRACE],
      deaths: h[HDR.HERO_DEATHS],
    };
  }

  spend(n: number): boolean {
    if (!this.charging || this.rich) return true;
    const amount = Math.max(0, n);
    if (this.scrap < amount) return false;
    this.header[HDR.SCRAP] -= amount;
    return true;
  }

  // ---- the tables ----

  /** a kind's live stats: the composed table's row, or the stock one */
  statsFor(kind: TowerKind): TowerStats {
    return this.specs.get(kind) ?? structStats(kind);
  }

  /** the same resolution for a bullet already in the air (Sim.bulletFor) */
  bulletFor(kind: TowerKind, frag: boolean, alt = false): BulletStats {
    const own = this.statsFor(kind).bullet;
    const b = alt && own.alt ? own.alt : own;
    return frag && b.frag ? b.frag.bullet : b;
  }

  /** the live census, per kind id, off shared memory (SimView.aliveByKind) */
  aliveByKindList(): number[] {
    return Array.from(this.flat.aliveByKind);
  }

  private hillMem: Uint8Array | null = null;
  /** the masks a placement reads (board.ts) */
  grids(): BoardGrids {
    return {
      blocked: this.terrain.blocked,
      spawn: this.terrain.spawn,
      reserved: this.terrain.reserved,
      isGoal: this.isGoal,
      occupied: this.occupied,
      waterlogged: this.waterlogged,
      hill: (this.hillMem ??= hillMask(this.terrain)),
    };
  }
}
