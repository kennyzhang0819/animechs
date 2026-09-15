/**
 * THE SIM'S CLOCK, on its own so that both places the sim can step from
 * keep the same time.
 *
 * The frame loop used to own this: it banked the display's real time and
 * stepped the world in SIM_DT quanta, capped at SIM_STEPS_MAX a frame,
 * forfeiting the rest. That rule is the game's feel — a 144Hz display
 * steps on some frames and not others, a 30Hz one twice a frame, and both
 * play the same game at the same rate — and it must not change depending
 * on WHICH THREAD the sim is stepping on. So it lives here, and the local
 * host (simhost.ts) and the worker (sim.worker.ts) both drive it.
 */

/**
 * The sim's fixed step. rAF is the display's rate, not the game's: a
 * 120Hz phone would run the whole simulation twice as often for motion
 * nobody can see, and exactly on the devices with the least CPU to spare.
 * So the caller banks real time and steps the sim in SIM_DT quanta.
 */
export const SIM_DT = 1 / 60;
/**
 * Most catch-up steps one advance will run. dt is already clamped to
 * DT_CAP, so 3 covers an honest slow frame; anything longer (a
 * backgrounded tab, a device asleep) is simply dropped rather than
 * replayed at 16x cost — the spiral where slow frames beget more sim work
 * which begets slower frames has to break somewhere, and losing banked
 * time is the cheap end.
 */
export const SIM_STEPS_MAX = 3;
/**
 * How much of a frame's elapsed time the sim is allowed to hear about, so
 * a tab that was hidden for a minute does not come back owing a minute of
 * catch-up (see SIM_STEPS_MAX).
 */
export const DT_CAP = 0.05;

export class SimClock {
  private acc = 0;

  /**
   * Bank `dt` seconds and run every whole step it buys, up to the cap.
   * Returns how many steps ran. A held sim (`run` false) owes nothing:
   * without that, time banked while paused would replay as a burst of
   * catch-up steps on unpause.
   */
  advance(dt: number, run: boolean, step: (dt: number) => void): number {
    if (!run) {
      this.acc = 0;
      return 0;
    }
    this.acc += Math.min(dt, DT_CAP);
    let s = 0;
    for (; this.acc >= SIM_DT && s < SIM_STEPS_MAX; s++) {
      this.acc -= SIM_DT;
      step(SIM_DT);
    }
    // time the step cap refused is forfeit, not owed (see SIM_STEPS_MAX)
    if (this.acc >= SIM_DT) this.acc = 0;
    return s;
  }
}
