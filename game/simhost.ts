/**
 * WHERE THE SIM IS, AND HOW YOU TALK TO IT.
 *
 * `Game` used to call `Sim` directly, which is only possible while the two
 * are in the same thread. This is the seam that stops assuming that: every
 * way the game CHANGES the world goes through here, as a call with plain
 * arguments and no answer.
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
 * TWO IMPLEMENTATIONS ARE INTENDED. `LocalHost` keeps the sim in this
 * thread and forwards, which is what ships today and what the headless
 * check and the playtest use. A worker host puts the same calls on a
 * message, and because the shape here has no answers in it, the caller
 * cannot tell which one it has.
 */
import type { Sim } from "./sim";
import type { ModId } from "./mods";
import type { RelicId } from "./relics";
import type { TechState } from "./tech";
import type { TowerKind } from "./types";

/** a footprint's top-left cell — what a placement command carries */
export interface Cell {
  readonly gx: number;
  readonly gy: number;
}

/**
 * EVERY WAY THE GAME CHANGES THE WORLD. Nothing here returns anything; see
 * the header for why, and for where the answers come from instead.
 */
export interface SimHost {
  /** the world itself, for the reads that have not moved yet — see the
   *  note in Game about what is still asked of it directly */
  readonly sim: Sim;

  // ---- the clock ----
  step(dt: number): void;
  reset(): void;
  /** the sandbox's jump: wave `n` on the field this instant (Sim.skipToWave) */
  skipToWave(n: number): void;

  // ---- building ----
  /** one held card, laid down whole (Sim.placeFormation) */
  placeFormation(cells: readonly Cell[], kind: TowerKind): void;
  placeTower(gx: number, gy: number, kind: TowerKind): void;
  placeLine(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void;
  placeRuler(x0: number, y0: number, x1: number, y1: number, kind: TowerKind): void;

  // ---- unbuilding ----
  sellTowerAt(x: number, y: number): void;
  sellLine(x0: number, y0: number, x1: number, y1: number): void;
  sellSelected(): void;

  // ---- what is picked ----
  structsInRect(x0: number, y0: number, x1: number, y1: number, add: boolean): void;
  clearStructSelection(): void;

  // ---- the run's money and what it buys ----
  spend(n: number): void;
  takeMod(id: ModId): void;
  takeRelic(id: RelicId): void;

  // ---- settings the world keeps ----
  setTech(tech: TechState | null): void;
  setRich(on: boolean): void;
  setEffects(on: boolean): void;
}

/**
 * THE SIM, IN THIS THREAD. What ships today: every command is the call it
 * always was, made immediately, and the world is changed before the line
 * returns. It exists so that the seam above is exercised by the shipping
 * path rather than only by the one that does not exist yet — a boundary
 * nothing crosses is a boundary nobody maintains.
 */
export class LocalHost implements SimHost {
  constructor(readonly sim: Sim) {}

  step(dt: number): void {
    this.sim.update(dt);
  }
  reset(): void {
    this.sim.reset();
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
}
