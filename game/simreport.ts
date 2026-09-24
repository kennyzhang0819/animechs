/**
 * WHAT THE GAME READS OFF THE WORLD, as numbers and plain data.
 *
 * simview.ts is what the PICTURE needs and simhost.ts is how the world is
 * CHANGED; this is the third side of the seam — everything the game logic
 * and the HUD ask of the sim between one frame and the next. It used to be
 * fifty-odd `this.sim.x` reads scattered through Game, every one of them a
 * call that only works while the sim is in the same thread. Here they are
 * written down as two things that can cross one:
 *
 *   THE HEADER — a short float array on shared memory, one slot a scalar:
 *   the clock, the count, the purse, the wave. The sim writes it after
 *   every step (writeHeader) and the game reads the slot directly, so the
 *   frame loop's own questions (is it lost? how many bodies?) cost a load
 *   and are never a frame stale.
 *
 *   THE REPORT — the answers that are not one number: the boss bars, the
 *   census, what is held, what the panel prints. Built once a publish
 *   (reportOf) on the side the sim is on and handed across as plain data.
 *   Nothing in it holds a reference into the sim, which is what makes it
 *   sendable and what makes it the honest version of the reads that used
 *   to reach into the sim's own objects.
 *
 * The inspect panel is composed HERE rather than in Game because every
 * question it asks — which body, what plating, which attributes — has its
 * answer in the sim's arrays and tables, and a panel that asked those
 * questions across a thread would be a panel a frame behind its own arrow.
 */
import type { Sim } from "./sim";
import { TOWERS, type TowerStats } from "./constants";
import { UNIT_KINDS, unitName, type UnitKind } from "./levels";
import { modsInMask, TURRET_MOD_IDS, type ModId } from "./mods";
import type { RelicId } from "./relics";
import { structSelectionChips, unitStatusChips, type StatusChip } from "./status";
import { isCore, type Structure, type Tower, type TowerKind } from "./types";

// ---------- the header ----------

/** slot of each scalar in Sim.header — the game reads these by name */
export const HDR = {
  TIME: 0,
  N: 1,
  FXN: 2,
  KILLS: 3,
  SCRAP: 4,
  SCRAP_EARNED: 5,
  DEADLINE: 6,
  TOTAL_WAVES: 7,
  PLACED: 8,
  LOST: 9,
  WON: 10,
  REMAINING: 11,
  CURRENT_WAVE: 12,
  NEXT_WAVE_IN: 13,
  WAVES_CLEARED: 14,
  CHARGING: 15,
  /** the body the last tap marked, by slot, or -1 (Sim.inspectedUnit) */
  INSPECTED_UNIT: 16,
  /** goes up every time the live spec table is recomposed (Sim.refreshSpecs) */
  SPECS: 17,
  /**
   * THE INTERCEPT MISSION'S LEDGER (levels.ts InterceptMission): crossers
   * destroyed whole, crossers that got across, and how many are on the
   * board right now. Three slots rather than a row in the report because
   * the objective panel reads them every frame and a mission a frame
   * stale is a mission that says "6 of 7" over a won run.
   */
  CROSS_KILLED: 19,
  CROSS_LEAKED: 20,
  CROSS_LIVE: 21,
  /**
   * HOW FAR THROUGH ITS OBJECTIVE THE RUN IS, 0 to 1 (Sim.missionProgress)
   * — the one number every progress bar is drawn from, whichever mission
   * is being played. It is a slot rather than a row in the report for the
   * same reason the crossers' ledger is: a bar a frame stale is a bar
   * still filling over a finished run.
   */
  MISSION_PROGRESS: 22,
  /** how many times the tide has turned (Sim.loopCycle) — the swarm's
   *  health is 2^this, and the HUD says so once it is above zero */
  LOOP_CYCLE: 23,
  /** the authored script's own wave count, which the tide never moves */
  SCRIPT_WAVES: 24,
  /**
   * THE ESCORT MISSION'S LEDGER (levels.ts EscortMission), beside the
   * intercept's and for the same reason: carts delivered, carts lost, how
   * far the one on the road has got (0 to 1), how many halts it has still
   * to make, and whether it is standing at one right now.
   *
   * The cart's own health does not need a slot — it wears an objective
   * bar (Sim.objectiveBars) like a Borer or the Sovereign does, and that
   * rides the report.
   */
  CONVOY_DONE: 25,
  CONVOY_LOST: 26,
  CONVOY_AT: 27,
  CONVOY_HALTS: 28,
  CONVOY_HALTED: 29,
  /**
   * THE RAZE MISSION'S LEDGER (levels.ts RazeMission), beside the other
   * two and for the same reason: emplacements destroyed, and how many are
   * still firing on the core.
   *
   * The second one is not derivable from the first on this side of the
   * seam. "Risen minus killed" needs the schedule AND the clock, and the
   * panel has neither — what it has is a sentence to print, and the number
   * in it changes every time a section rises or an emplacement falls.
   */
  RAZE_KILLED: 30,
  RAZE_UP: 31,
  /** the sweep's ledger (levels.ts SweepMission): houses down, houses drawn */
  FAB_KILLED: 32,
  FAB_TOTAL: 33,
  /** which garrison circles are still held, one bit per mark in document
   *  order (Sim.garrisonHeldMask) — the leash does not cross the seam, so
   *  the overlay cannot work it out from kinds */
  GARRISON_HELD: 34,
} as const;
export const HEADER_LEN = 35;

/** the sim's scalars, into its own header — after every step, and on reset */
export function writeHeader(sim: Sim): void {
  const h = sim.header;
  h[HDR.TIME] = sim.time;
  h[HDR.N] = sim.n;
  h[HDR.FXN] = sim.fxN;
  h[HDR.KILLS] = sim.kills;
  h[HDR.SCRAP] = sim.scrap;
  h[HDR.SCRAP_EARNED] = sim.scrapEarned;
  h[HDR.DEADLINE] = sim.deadline;
  h[HDR.TOTAL_WAVES] = sim.totalWaves;
  h[HDR.PLACED] = sim.placed;
  h[HDR.LOST] = sim.lost() ? 1 : 0;
  h[HDR.WON] = sim.won() ? 1 : 0;
  h[HDR.REMAINING] = sim.remaining();
  h[HDR.CURRENT_WAVE] = sim.currentWave();
  h[HDR.NEXT_WAVE_IN] = sim.nextWaveIn();
  h[HDR.WAVES_CLEARED] = sim.wavesCleared();
  h[HDR.CHARGING] = sim.charging ? 1 : 0;
  h[HDR.INSPECTED_UNIT] = sim.inspectedUnit;
  h[HDR.SPECS] = sim.specsVersion;
  h[HDR.CROSS_KILLED] = sim.crossKilled;
  h[HDR.CROSS_LEAKED] = sim.crossLeaked;
  h[HDR.CROSS_LIVE] = sim.crossersLive();
  h[HDR.MISSION_PROGRESS] = sim.missionProgress();
  h[HDR.LOOP_CYCLE] = sim.loopCycle;
  h[HDR.SCRIPT_WAVES] = sim.scriptWaves;
  h[HDR.RAZE_KILLED] = sim.razeKilled;
  h[HDR.RAZE_UP] = sim.razeUp();
  h[HDR.FAB_KILLED] = sim.fabKilled;
  h[HDR.FAB_TOTAL] = sim.fabTotal;
  h[HDR.GARRISON_HELD] = sim.garrisonHeldMask();
  h[HDR.CONVOY_DONE] = sim.convoyDone;
  h[HDR.CONVOY_LOST] = sim.convoyLost;
  {
    const cv = sim.liveConvoy();
    h[HDR.CONVOY_AT] = cv ? cv.at : 0;
    h[HDR.CONVOY_HALTS] = cv ? cv.halts : 0;
    h[HDR.CONVOY_HALTED] = cv && cv.halted ? 1 : 0;
  }
}

// ---------- the phase clock's reading ----------

/** what one step has to fit in at 60fps — the line every figure is read against */
export const STEP_BUDGET_MS = 1000 / 60;

/**
 * THE KINDS OF WORK A STEP DOES, in the order Sim files them.
 *
 * There is one entry here for every distinct thing the sim can spend a
 * step on, because a phase's milliseconds mean nothing without the count
 * of whatever that phase was actually doing — and the phases do not all
 * do the same thing. A body sweep and a sight ray and a per-body pass are
 * three different units of work, and dividing a phase's time by the wrong
 * one produces a confident, wrong answer.
 *
 *   hashcands   bodies the broad phase handed the narrow one
 *   structcands candidates walked out of the building index / cell grid
 *   rays        sight rays cast (Sim.hasSight)
 *   raycells    grid cells those rays walked — a ray's cost is its LENGTH
 *   bodies      iterations of the big linear per-body / per-shot passes
 *   picks       target searches actually run (Sim.pickAim)
 *   solves      flow-field solve slices spent (Sim.runSolveQueue) — the
 *               route re-solve is sliced across steps, so what explains a
 *               spike is not how many cells it touched but WHETHER a
 *               slice landed on this step at all
 *
 * A PHASE WITH TIME AND NO COUNTERS is not a phase doing cheap work — it
 * is a phase doing work nobody counted, and it should read as exactly
 * that rather than as a suspiciously expensive candidate.
 */
export const WORK_NAMES = [
  "hashcands",
  "structcands",
  "rays",
  "raycells",
  "bodies",
  "picks",
  "solves",
] as const;
export const NWORK = WORK_NAMES.length;

/**
 * ONE PASS OF THE STEP, with the work beside the time. `ms` alone cannot
 * tell a pass that got dearer per item from one that was handed more
 * items, and those have opposite fixes — `probes` is the divisor that
 * separates them (Sim.probes).
 */
export interface PhaseRead {
  name: string;
  /** mean milliseconds PER STEP, not per frame (a slow frame steps twice) */
  ms: number;
  /** the dearest single step this phase had — where a stutter actually lives */
  worst: number;
  /** broad-phase candidates this phase walked, per step (== work[0]) */
  probes: number;
  /** every kind of work this phase did, per step — indexed by WORK_NAMES */
  work: number[];
  /** ...and over the steps that missed the budget alone. See slowMs. */
  slowWork: number[];
  /**
   * THE SAME TWO OVER THE STEPS THAT MISSED THE BUDGET, averaged over
   * those alone (ProfileRead.over says how many there were; meaningless
   * when that is zero). This is what a long window is read through: a
   * phase that is small in `ms` and large here only costs anything when
   * things go wrong, which is the definition of what makes a game stutter
   * rather than run slow.
   */
  slowMs: number;
  slowProbes: number;
}

/**
 * THE POPULATIONS every figure in the table is per. Read straight off the
 * sim, so it describes the instant it was asked rather than the window
 * the times were averaged over — which is what you want: the times say
 * what the slow part cost and this says what the board looked like while
 * it did.
 */
export interface ProfileCensus {
  wave: number;
  bodies: number;
  air: number;
  ground: number;
  /** the player's shots in the air, and the swarm's (projectiles + stars) */
  shots: number;
  hostileShots: number;
  towers: number;
  domes: number;
  corpses: number;
  fx: number;
  /**
   * THE WIDEST LIVE HITBOX on each layer, px. Every broad-phase pad but
   * the shot sweep's is sized by this and not by the thing doing the
   * asking (Sim.rmaxAliveFor); the shot sweep pads to the widest body that
   * is not a giant and meets the giants off a list, and shotSpan below is
   * what one shot actually paid.
   */
  rmaxAir: number;
  rmaxGround: number;
  /** the pad that follows, in hash cells, and the cells one shot sweeps */
  shotSpan: number;
  shotCells: number;
  /**
   * THE SAME THREE AT THEIR HIGHEST over the window the times were taken
   * over. Everything above is the board as it stands NOW; the worst step
   * in the table was very likely not now, and without these the two
   * halves of the reading cannot be put together.
   */
  peakBodies: number;
  peakShots: number;
  peakRmax: number;
}

/** the whole reading: the step, its phases, and what the board held */
export interface ProfileRead {
  /** steps in the tally — the window every mean below is over */
  steps: number;
  /** mean whole-step ms, and the dearest single step of the window */
  ms: number;
  worst: number;
  /** how many of those steps ran over STEP_BUDGET_MS */
  over: number;
  /** mean whole-step ms over THOSE steps alone — how bad a bad step is */
  slowMs: number;
  /**
   * GAME TIME AND WALL TIME over the window, in ms. `simMs` is the steps
   * times SIM_DT — how much WORLD went by. `liveMs` is how long the sim
   * was live to produce it, pause excluded (Sim.profLiveMs). They agree
   * while the sim keeps up; simMs falling behind liveMs is the clock
   * forfeiting catch-up steps, which is the world running in slow motion
   * and is what a player reports as things moving jerkily.
   */
  simMs: number;
  liveMs: number;
  /** what the board was carrying at the dearest step of all */
  worstBodies: number;
  worstShots: number;
  phases: PhaseRead[];
  census: ProfileCensus;
}

/**
 * THE READING AS TEXT, and the reason this is a function rather than
 * something the console draws itself: a profile is only useful when it is
 * PASTEABLE. The whole point of arming the clock is to hand the numbers
 * to somebody — a teammate, a bug report, a model — and a reading that
 * has to be described in prose ("projectiles was about ten, I think the
 * body count was high") is a reading that has already lost the two or
 * three figures that would have identified the cause.
 *
 * So everything needed to reach a conclusion is in the block and nothing
 * needs to be remembered alongside it: the window it was taken over, the
 * board it was taken on, the pad every sweep is paying, and then the
 * table — with each phase's per-candidate cost worked out, because that
 * is the one division that says WHICH KIND of problem this is and it
 * needs no knowledge of what the phase does.
 *
 * Deliberately NOT here: any table mapping a phase to "its" population.
 * That table would have to be updated by hand every time a pass moved,
 * and a stale one would quietly divide by the wrong number — which is
 * worse than not dividing. The census is printed whole instead, and the
 * arithmetic is left to the reader, who can see both halves.
 */
export function profileLines(p: ProfileRead): string[] {
  const c = p.census;
  const num = (n: number): string => Math.round(n).toLocaleString("en-US");
  const out: string[] = [];
  // THE WINDOW, and how much of it was actually bad. The share matters
  // more than the mean on a long arm: three minutes of play is ten
  // thousand steps, and forty bad ones are both a real stutter and a
  // rounding error in the average
  out.push(
    `wave ${c.wave} · ${num(p.steps)} steps · step ${p.ms.toFixed(2)}ms mean, ` +
      `${p.worst.toFixed(1)} worst ` +
      `(${num(p.worstBodies)} bodies, ${num(p.worstShots)} shots at that step)`,
  );
  // GAME TIME AGAINST WALL TIME. The pace is the first thing to read: a
  // sim under 100% is not merely slow, it is running the world in slow
  // motion, and every figure below it is the cost of a step that the
  // game could not afford to take often enough
  const pace = p.liveMs > 0 ? (100 * p.simMs) / p.liveMs : 100;
  out.push(
    `pace:  ${(p.simMs / 1000).toFixed(1)}s of game time in ${(p.liveMs / 1000).toFixed(1)}s live ` +
      `= ${pace.toFixed(0)}% of real time` +
      // ...AND WHAT THAT MEANS, in three cases rather than two. Over real
      // time is not a better score: it means nothing paced this window to
      // a display at all — a headless harness stepping flat out — and the
      // figure should be ignored rather than read as headroom
      (pace > 150
        ? `  (not frame-paced — a harness, not a played window; ignore this line)`
        : pace < 95
          ? `  ← THE SIM IS BEHIND: the clock is forfeiting catch-up steps, so the` +
            ` world itself runs slow. Pause is excluded from this`
          : "  (keeping up)"),
  );
  out.push(
    p.over > 0
      ? `slow:  ${num(p.over)} steps over ${STEP_BUDGET_MS.toFixed(1)} ` +
        `(${((100 * p.over) / Math.max(1, p.steps)).toFixed(1)}% of the window), ` +
        `averaging ${p.slowMs.toFixed(1)}ms — the "slow" column below is those steps alone`
      : `slow:  no step missed ${STEP_BUDGET_MS.toFixed(1)}ms — nothing here stuttered`,
  );
  out.push(
    `board: ${num(c.bodies)} bodies (${num(c.air)} air, ${num(c.ground)} ground) · ` +
      `${num(c.shots)} shots, ${num(c.hostileShots)} hostile · ${num(c.towers)} turrets` +
      `${c.domes > 0 ? `, ${num(c.domes)} domes` : ""}` +
      `${c.corpses > 0 ? `, ${num(c.corpses)} corpses` : ""} · ${num(c.fx)} fx`,
  );
  // THE PAD, on its own line because it is the line that explains a board
  // whose populations did not move and whose probe count did
  out.push(
    `peak:  ${num(c.peakBodies)} bodies · ${num(c.peakShots)} shots · widest hitbox ${c.peakRmax.toFixed(0)}px` +
      `   (over the whole window — the board above is only right now)`,
  );
  out.push(
    `pad: widest live hitbox ${c.rmaxAir.toFixed(0)}px air / ${c.rmaxGround.toFixed(0)}px ground` +
      ` → each shot sweeps ${c.shotCells} hash cells (span ${c.shotSpan})`,
  );
  let total = 0;
  for (const q of p.phases) total += q.ms;
  /**
   * A PHASE'S WORK, NAMED — and nothing it did not do. A counter under
   * one per step is printed as the WINDOW TOTAL instead of a mean,
   * because the mean of a rare event is zero and a zero here reads as
   * "this phase did nothing", which is the opposite of the truth for the
   * expensive rare ones.
   */
  const workOf = (w: readonly number[]): string => {
    const did = WORK_NAMES.map((name, k) => [name, w[k] ?? 0] as const).filter(
      ([, v]) => v > 0.004,
    );
    if (!did.length) return "— nothing counted here (see WORK_NAMES)";
    return did
      .map(([name, v]) =>
        v >= 1 ? `${name} ${num(v)}` : `${name} ${v.toFixed(3)}`,
      )
      .join(" · ");
  };
  // the slow column is a column and not a second table so the two
  // averages sit on one line per phase: the eye wants the RATIO of them,
  // and a phase whose slow figure towers over its mean is the answer
  const slowCol = p.over > 0;
  out.push(
    `${"phase".padEnd(13)}${"ms".padStart(7)}${"worst".padStart(8)}${"share".padStart(7)}` +
      (slowCol ? `${"slow ms".padStart(9)}` : "") +
      `   work (per step)`,
  );
  for (const q of p.phases) {
    // a phase that costs nothing and walked nothing is noise in a block
    // that is meant to be read at a glance — but never drop one that is
    // quiet on average and dear when things go wrong, which is exactly
    // the shape the whole slow column exists to find
    if (q.ms < 0.02 && q.probes < 1 && (!slowCol || q.slowMs < 0.02)) continue;
    const share = total > 0 ? (q.ms / total) * 100 : 0;
    // EVERY COUNTER THIS PHASE MOVED, named, and none that it did not.
    // The per-item cost is deliberately NOT computed here: a phase that
    // moved three different counters has no single item, and picking one
    // to divide by is how the last version of this block produced a
    // confident wrong answer
    out.push(
      q.name.padEnd(13) +
        q.ms.toFixed(2).padStart(7) +
        q.worst.toFixed(1).padStart(8) +
        `${share.toFixed(0)}%`.padStart(7) +
        (slowCol ? q.slowMs.toFixed(2).padStart(9) : "") +
        "   " +
        workOf(q.work),
    );
    // ...AND WHAT A SLOW STEP DID DIFFERENTLY, under the phases that are
    // actually dear when things go wrong. This is where a rare event
    // shows itself: a route re-solve is 0.007 slices per step and 1.0 per
    // slow step, and only the second number is an explanation
    if (slowCol && q.slowMs >= 1) {
      const sw = workOf(q.slowWork);
      if (sw !== workOf(q.work))
        out.push(`${" ".repeat(13)}${"on slow steps:".padStart(slowCol ? 31 : 22)}   ${sw}`);
    }
  }
  // THE PER-UNIT COSTS, worked out only where a phase moved exactly ONE
  // counter — the only case where the division is sound. This is the
  // figure that says whether a phase is dear per item or simply busy, and
  // it is printed for the phases it can honestly be printed for and no
  // others
  const unit: string[] = [];
  for (const q of p.phases) {
    if (q.ms < 0.02) continue;
    const did = WORK_NAMES.map((w, k) => [w, q.work[k] ?? 0] as const).filter(
      ([, v]) => v >= 0.5,
    );
    if (did.length !== 1) continue;
    const [w, v] = did[0];
    unit.push(`${q.name} ${((q.ms * 1e6) / v).toFixed(0)}ns/${w}`);
  }
  if (unit.length) out.push(`per unit: ${unit.join(" · ")}`);
  out.push(
    `${"phases".padEnd(13)}${total.toFixed(2).padStart(7)}` +
      `  (the marks leave the gaps out; the step above is the honest total)`,
  );
  return out;
}

// ---------- the report ----------

/** what the panel prints — see UiState.inspect for what each field means */
export interface InspectPanel {
  n: number;
  kind: TowerKind | null;
  unit: UnitKind | null;
  name: string;
  hp: number;
  hpMax: number;
  statuses: StatusChip[];
  mods: { id: ModId; n: number }[];
}

export interface WorldReport {
  /** every OBJECTIVE body on the field — bosses, Borer trains and the
   *  escort's own hauler — for the HUD's bar stack (Sim.objectiveBars).
   *  Named here rather than keyed by unit kind, because a train is a pool
   *  over twenty pieces and has no one kind to be named after; `ally` is
   *  whose side the row is on, which is what the HUD paints it off */
  objectives: { id: number; name: string; hp: number; max: number; ally: boolean }[];
  /** the player's live turrets per kind (Sim.towerCounts) */
  counts: Record<TowerKind, number>;
  /** the shelf: every mod the run owns with its count, and every relic */
  mods: { id: ModId; n: number }[];
  relics: RelicId[];
  inspect: InspectPanel | null;
  /**
   * THE LIVE SPEC TABLE, only when it has changed since the version the
   * reader said it had — a placement, a purchase or a tech change. It is
   * the one object here that is not small (every upgraded kind's whole
   * stats), and it changes a handful of times a run rather than sixty
   * times a second. Null means "what you have is still right".
   */
  specs: [TowerKind, TowerStats][] | null;
  /**
   * THE PHASE CLOCK'S WHOLE READING while it is armed (Sim.profile), else
   * null. It rides the report rather than the header because it is the
   * one question about the sim that cannot be answered in a number, and
   * because the sim answering it may be a thread away — a profiler that
   * only worked in-thread would be a profiler for the build nobody plays.
   */
  profile: ProfileRead | null;
}

/**
 * BUILD THE REPORT, on the side the sim is on. `specsSeen` is the table
 * version the reader last took, so the table rides along only when it
 * has moved.
 */
export function reportOf(sim: Sim, specsSeen: number): WorldReport {
  return {
    objectives: sim.objectiveBars(),
    counts: sim.towerCounts(),
    mods: sim.ownedMods(),
    relics: sim.ownedRelics(),
    inspect: inspectPanel(sim),
    specs: sim.specsVersion !== specsSeen ? sim.specTable() : null,
    profile: sim.profiling ? sim.profileFull() : null,
  };
}

/**
 * WHAT THE PANEL PRINTS, and the order the question is asked in: what the
 * player is HOLDING first, and then what their last tap MARKED.
 *
 * THAT SECOND HALF IS THE WHOLE OF WHAT A TAP ON AN ENEMY MEANS
 * (Sim.setInspectUnit) — what is that, how much of it is left, what has
 * landed on it. Everything needed to answer was already in the sim's
 * arrays and none of it was ever on the screen.
 *
 * It is the same panel either way: a picture, a name, the row of
 * statuses, a pool. What a body cannot have is attributes, which is
 * exactly what an empty mods row says.
 */
export function inspectPanel(sim: Sim): InspectPanel | null {
  const picked = sim.selectedStructs;
  if (picked.length > 0) return inspectStructs(picked);
  // NOTHING OF OURS IS HELD, so the panel answers the other thing a
  // click can mean: what the last tap MARKED (Sim.setInspectUnit) —
  // bodies first, exactly as pickAt asks them
  const ui = sim.inspectedUnit;
  if (ui >= 0) {
    return {
      n: 1,
      kind: null,
      unit: UNIT_KINDS[sim.ukind[ui]],
      // THE NAME, NOT THE ID (levels.ts UNIT_NAMES). The kind keys the
      // sim's arrays and the sprite files; what a body is CALLED is the
      // animal its family draws as, and the panel is the one place a
      // player ever reads it
      name: unitName(UNIT_KINDS[sim.ukind[ui]]),
      hp: Math.ceil(sim.uhp[ui]),
      hpMax: Math.ceil(sim.uhpmax[ui]),
      statuses: unitStatusChips(sim, ui),
      mods: [],
    };
  }
  // a turret the swarm has taken is a BUILDING, and reads as one — its
  // pools, its plating, the attributes it was built with and the fact
  // that it has changed sides, which is a status of its own
  const et = sim.inspectedTower;
  if (et) return inspectStructs([et]);
  const st = sim.inspectedShieldTower;
  if (st) {
    return {
      n: 1,
      kind: null,
      unit: null,
      name: st.mega ? "Mega shield tower" : "Shield tower",
      hp: Math.ceil(st.hp),
      hpMax: Math.ceil(st.hpMax),
      // the DOME is what a player is actually asking about, and it is
      // the same force field a carrier's bubble is
      statuses:
        st.shield > 0
          ? [
              {
                id: "shield",
                n: Math.ceil(st.shield),
                note: `${Math.ceil(st.shield)} of ${Math.ceil(st.shieldMax)} absorbed before the body`,
              },
            ]
          : [],
      mods: [],
    };
  }
  return null;
}

/**
 * THE BUILDING HALF OF THE PANEL — one turret, a marquee's whole catch,
 * or the one emplacement the swarm has taken.
 *
 * One pass over them: sum the pools, tally the attribute bits, and
 * decide whether they are all one kind. The core is a structure too and
 * has no attributes and no kind, which is exactly what a null kind and
 * an empty row say.
 */
function inspectStructs(picked: readonly Structure[]): InspectPanel {
  let hp = 0, hpMax = 0;
  let kind: TowerKind | null = null;
  let mixed = false;
  let anyCore = false;
  const tally = new Map<ModId, number>();
  for (const st of picked) {
    hp += st.hp;
    hpMax += st.hpMax;
    if (isCore(st)) {
      anyCore = true;
      continue;
    }
    const t = st as Tower;
    if (kind === null) kind = t.kind;
    else if (kind !== t.kind) mixed = true;
    for (const d of modsInMask(t.mods)) tally.set(d.id, (tally.get(d.id) ?? 0) + 1);
  }
  if (anyCore) mixed = kind !== null; // the core plus anything is a mixed bag
  const one = !mixed && kind !== null ? kind : null;
  return {
    n: picked.length,
    kind: one,
    unit: null,
    name: one
      ? TOWERS[one].name
      : anyCore && picked.length === 1
        ? "Core"
        : "Structures",
    hp: Math.ceil(hp),
    hpMax: Math.ceil(hpMax),
    // the plating that used to be a caption up here is the first chip
    // in this row now, on the same terms it was printed on before: one
    // number when every building picked wears the same, and nothing at
    // all when they disagree (status.ts)
    statuses: structSelectionChips(picked),
    // CATALOG ORDER, never tally order: the shelf at the other corner
    // lists attributes in that order and the two must not disagree about
    // which chip is which
    mods: TURRET_MOD_IDS.filter((id) => tally.has(id)).map((id) => ({
      id,
      n: tally.get(id)!,
    })),
  };
}
