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
} as const;
export const HEADER_LEN = 20;

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
  /** every boss on the field, for the HUD's bar stack (Sim.bossBars) */
  bosses: { id: number; kind: number; hp: number; max: number }[];
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
  /** the phase clock's reading while it is armed (Sim.profile), else null */
  phases: { name: string; ms: number }[] | null;
}

/**
 * BUILD THE REPORT, on the side the sim is on. `specsSeen` is the table
 * version the reader last took, so the table rides along only when it
 * has moved.
 */
export function reportOf(sim: Sim, specsSeen: number): WorldReport {
  return {
    bosses: sim.bossBars(),
    counts: sim.towerCounts(),
    mods: sim.ownedMods(),
    relics: sim.ownedRelics(),
    inspect: inspectPanel(sim),
    specs: sim.specsVersion !== specsSeen ? sim.specTable() : null,
    phases: sim.profiling ? sim.profileRead() : null,
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
