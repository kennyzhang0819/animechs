/**
 * WHERE THE SIM IS, AND HOW YOU TALK TO IT.
 *
 * `Game` used to call `Sim` directly, which is only possible while the two
 * are in the same thread. This is the seam that stops assuming that: every
 * way the game CHANGES the world goes through here, as a call with plain
 * arguments and no answer, and everything it READS comes back through
 * `world` (simreads.ts).
 *
 * NO ANSWER IS THE WHOLE POINT. A method that returns something is a method
 * that cannot be sent anywhere — the caller would have to wait, and the
 * thread that draws may not wait (there is no Atomics.wait on it, and there
 * should not be). So a command tells the world to change and the change is
 * seen the next time the world is published, exactly as the HUD already
 * works: `Animechs.tsx` polls `Game.ui()` ten times a second and has done
 * since long before any of this.
 *
 * THAT TURNED OUT TO COST NOTHING, which is why this shape was available.
 * Every button that spends — the turret card, the modules, the relics —
 * already throws its return value away and re-polls (`components/Deal.tsx`:
 * `g.buyTurretCard(); refresh();`). The marquee already discards its count.
 * The one place an answer was genuinely acted on is a placement, where the
 * card leaves the hand only if something landed — and that one is answered
 * WITHOUT asking the sim at all, because the board mirror (board.ts) can run
 * the same test over the same grids and get the same answer at the same
 * instant. Nothing here is a prediction.
 *
 * THE CLOCK IS BEHIND THE SEAM TOO. The frame loop says how much real
 * time has passed and whether the world should be moving (advance); how
 * that becomes steps is the host's business (simclock.ts), because on a
 * worker the steps are not taken in the frame at all.
 *
 * TWO IMPLEMENTATIONS. `LocalHost` keeps the sim in this thread and
 * forwards, which is what the headless check and the playtest use and what
 * a page without shared memory falls back to. `WorkerHost` (workerhost.ts)
 * puts the same calls on a message, and because the shape here has no
 * answers in it, the caller cannot tell which one it has.
 */
import type { Sim } from "./sim";
import type { ModId } from "./mods";
import type { RelicId } from "./relics";
import type { TechState } from "./tech";
import type { TowerKind } from "./types";
import { SimClock } from "./simclock";
import { emptySnapshot, flatOf, packSnapshot, type Snapshot } from "./snapshot";
import { reportOf, writeHeader } from "./simreport";
import { World } from "./simreads";

/** a footprint's top-left cell — what a placement command carries */
export interface Cell {
  readonly gx: number;
  readonly gy: number;
}

/** a saved placement: a cell and what stood on it */
export interface Placement extends Cell {
  readonly kind: TowerKind;
}

/**
 * EVERY WAY THE GAME CHANGES THE WORLD, and the one way it sees it. Nothing
 * here returns anything; see the header for why, and for where the answers
 * come from instead.
 */
export interface SimHost {
  /** what the game reads — see simreads.ts */
  readonly world: World;
  /**
   * THE SIM ITSELF, when it is in this thread, and null when it is not. A
   * debug handle (window.__animechs.sim) and nothing else: no read path in
   * the game may go through it, or that path breaks the day it is null.
   */
  readonly sim: Sim | null;

  // ---- the clock ----
  /** `dt` seconds of real time have passed; `run` says whether the world
   *  should be moving (not paused, no menu up) */
  advance(dt: number, run: boolean): void;
  /** bring `world` up to date with the sim: the header, the snapshot, the report */
  sync(): void;
  reset(): void;
  /** the sandbox's jump: wave `n` on the field this instant (Sim.skipToWave) */
  skipToWave(n: number): void;

  // ---- building ----
  /** one held card, laid down whole (Sim.placeFormation) */
  placeFormation(cells: readonly Cell[], kind: TowerKind): void;
  placeTower(gx: number, gy: number, kind: TowerKind): void;
  /** a saved layout, stood back up (Sim.placeMany) */
  placeMany(towers: readonly Placement[]): void;
  placeLine(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void;
  placeRuler(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void;

  // ---- unbuilding ----
  sellTowerAt(x: number, y: number): void;
  sellLine(x0: number, y0: number, x1: number, y1: number): void;
  sellSelected(): void;

  // ---- what is picked ----
  structsInRect(x0: number, y0: number, x1: number, y1: number, add: boolean): void;
  clearStructSelection(): void;
  /** one left click on the board, whatever it means (Sim.click) */
  click(x: number, y: number, add: boolean, like: boolean): void;

  // ---- the run's money and what it buys ----
  spend(n: number): void;
  takeMod(id: ModId): void;
  takeRelic(id: RelicId): void;

  // ---- settings the world keeps ----
  setTech(tech: TechState | null): void;
  setRich(on: boolean): void;
  setEffects(on: boolean): void;
  /** the sim's phase clock (Sim.profile); its reading rides the report */
  profile(on: boolean): void;

  /** the level is over: let go of whatever the host holds */
  destroy(): void;
}

/**
 * THE SIM, IN THIS THREAD. Every command is the call it always was, made
 * immediately, and the world is changed before the line returns. The
 * headless check and the playtest run on this, and so does a page that
 * cannot have shared memory (game/shared.ts) — and it goes through exactly
 * the same seam as the worker, so that the boundary is exercised by the
 * shipping path rather than only by the other one: a boundary nothing
 * crosses is a boundary nobody maintains.
 */
export class LocalHost implements SimHost {
  readonly world: World;
  private readonly clock = new SimClock();
  private readonly snapshot: Snapshot = emptySnapshot();

  constructor(
    readonly sim: Sim,
    /** the route solver's thread when the page spawned one for this sim
     *  (workerhost.ts makeHost) — ended with the level */
    private readonly fieldWorker: Worker | null = null,
    /** ...and the crowd shove's thread, likewise */
    private readonly physWorker: Worker | null = null,
  ) {
    this.world = new World({
      level: sim.level,
      flat: flatOf(sim),
      header: sim.header,
      bStart: sim.bStart,
      bUnits: sim.bUnits,
      isGoal: sim.field.isGoal,
      occupied: sim.occupied,
      waterlogged: sim.waterloggedMask(),
      airRoutes: sim.airRoutes(),
    });
    this.sync();
  }

  advance(dt: number, run: boolean): void {
    // a lost game freezes mid-carnage: the score screen sits over the
    // exact frame the base fell on, until retry resets the sim. A won game
    // keeps running — the field is empty and the last death effects get
    // to play out
    this.clock.advance(dt, run && !this.sim.lost(), (d) => this.sim.update(d));
  }
  sync(): void {
    writeHeader(this.sim);
    // the bolt paths stay by reference here: the flat half of the world
    // IS the sim's own arrays, fxPts included
    packSnapshot(this.sim, this.snapshot);
    this.world.take(this.snapshot, reportOf(this.sim, this.world.specsSeen));
  }
  reset(): void {
    this.sim.reset();
    this.sync();
  }
  skipToWave(n: number): void {
    this.sim.skipToWave(n);
  }
  placeFormation(cells: readonly Cell[], kind: TowerKind): void {
    this.sim.placeFormation(cells, kind);
  }
  placeTower(gx: number, gy: number, kind: TowerKind): void {
    this.sim.placeTower(gx, gy, kind);
  }
  placeMany(towers: readonly Placement[]): void {
    this.sim.placeMany(towers);
  }
  placeLine(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void {
    this.sim.placeLine(x0, y0, x1, y1, kind);
  }
  placeRuler(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void {
    this.sim.placeRuler(x0, y0, x1, y1, kind);
  }
  sellTowerAt(x: number, y: number): void {
    this.sim.sellTowerAt(x, y);
  }
  sellLine(x0: number, y0: number, x1: number, y1: number): void {
    this.sim.sellLine(x0, y0, x1, y1);
  }
  sellSelected(): void {
    this.sim.sellSelected();
  }
  structsInRect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    this.sim.structsInRect(x0, y0, x1, y1, add);
  }
  clearStructSelection(): void {
    this.sim.clearStructSelection();
  }
  click(x: number, y: number, add: boolean, like: boolean): void {
    this.sim.click(x, y, add, like);
  }
  spend(n: number): void {
    this.sim.spend(n);
  }
  takeMod(id: ModId): void {
    this.sim.takeMod(id);
  }
  takeRelic(id: RelicId): void {
    this.sim.takeRelic(id);
  }
  setTech(tech: TechState | null): void {
    this.sim.setTech(tech);
  }
  setRich(on: boolean): void {
    this.sim.setRich(on);
  }
  setEffects(on: boolean): void {
    this.sim.setEffects(on);
  }
  profile(on: boolean): void {
    this.sim.profile(on);
  }
  destroy(): void {
    // the sim goes with the Game; the thread its route solver runs on
    // does not go by itself
    this.sim.dispose();
    this.fieldWorker?.terminate();
    this.physWorker?.terminate();
  }
}
