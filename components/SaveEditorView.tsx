"use client";

import { useCallback, useEffect, useState } from "react";

import { LEVEL_CAP, levelProgress, xpAtLevel, xpToNext, XP_COLOR } from "@/game/economy";
import {
  RUNG_COUNT,
  rungColor,
  rungLabel,
  tierMutationCount,
  TOP_TIER,
  XP_BASE_TIER,
} from "@/game/ladder";
import { WORLDS } from "@/game/levels";
import { MODS } from "@/game/mods";
import { MUTATIONS } from "@/game/mutation";
import {
  effectiveLevel,
  levelOf,
  loadProgress,
  resetProgress,
  saveProgress,
  type Progress,
} from "@/game/progress";
import { RELICS } from "@/game/relics";
import {
  difficultyOpen,
  MAX_LEVEL,
  modsAt,
  mutatorsAt,
  MUTATORS_FROM,
  nextRewardLevel,
  relicsAt,
  rewardsAt,
  rewardText,
  speedsAt,
  turretsAt,
  worldUnlockLevel,
} from "@/game/track";
import { FIELDED_KINDS } from "@/game/types";

/**
 * THE SAVE EDITOR — the one save slot (storage.ts), opened up and made
 * typeable, so a level anywhere on the track can be reached without
 * playing the runs that would pay for it.
 *
 * THE SAVE HAS ONE NUMBER AND EVERYTHING ELSE IS READ OFF IT. Lifetime XP
 * is the whole of a campaign's progress: the LEVEL is read off the curve
 * in economy.ts, and the level is a step on the track (track.ts) — every
 * map, pace, turret, mod, relic and mutator the save owns is a function of
 * it. So this board edits XP, offers the level as the same dial in the
 * units anyone actually thinks in, and then PRINTS WHAT THAT BUYS: a
 * number you cannot see the consequences of is a number you have to guess
 * at twice.
 *
 * THE DEV GRANT IS ON THIS PAGE FOR A REASON. A dev build plays every save
 * at the top of the track whatever its XP says (progress.ts DEV_UNLOCK_ALL),
 * which would make every edit here look like it did nothing. The grant is
 * the second switch on this board, right under the first, and the readout
 * always says which level the save PLAYS at as well as which it has earned.
 *
 * NOTHING IS WRITTEN UNTIL APPLY. The fields are a draft — half-typed XP
 * is not a save state, and a slider dragged across the track would
 * otherwise write thirty times on the way past.
 */

/** the save as this board edits it — everything else on it is carried through */
type Draft = Progress;

const same = (a: Draft, b: Draft): boolean =>
  a.xp === b.xp &&
  (a.devGrantOff ?? false) === (b.devGrantOff ?? false) &&
  JSON.stringify(a.clearedByMap) === JSON.stringify(b.clearedByMap);

const num = (n: number): string => n.toLocaleString("en-US");

const CARD = "rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-4";
const HEAD = "mb-3 text-[14px] font-bold uppercase tracking-widest text-[#71717C]";
const FIELD =
  "w-36 rounded border border-[#2E2E36] bg-[#0B0B0D] px-2 py-1 text-right font-mono text-[15px] tabular-nums text-[#EDEDEF]";
const BTN =
  "rounded border border-[#2E2E36] px-3 py-1.5 text-[15px] font-bold text-[#A6A6AF] transition-colors hover:border-[#4A4A55] hover:text-[#EDEDEF] disabled:opacity-40 disabled:hover:border-[#2E2E36] disabled:hover:text-[#A6A6AF]";

/** a jump the level dial offers, because these four are where anyone aims */
function Jump({ level, note, onPick }: { level: number; note: string; onPick: () => void }) {
  return (
    <button onClick={onPick} className={BTN}>
      {level} <span className="font-normal text-[#71717C]">· {note}</span>
    </button>
  );
}

/** one line of the summary: what is open, out of what there is */
function Tally({ label, have, all }: { label: string; have: number; all: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#2E2E36] py-1.5 first:border-t-0">
      <span className="text-[#A6A6AF]">{label}</span>
      <span className="font-mono tabular-nums text-[#EDEDEF]">
        {have}
        <span className="text-[#71717C]"> / {all}</span>
      </span>
    </div>
  );
}

export default function SaveEditorView() {
  // the save is localStorage (or the desktop bridge) — read it after mount,
  // never during the render the server also runs
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const reload = useCallback(() => {
    const p = loadProgress();
    setSaved(p);
    setDraft(p);
  }, []);

  useEffect(reload, [reload]);

  if (!draft || !saved) return <p className="text-[#71717C]">Reading the save…</p>;

  const edit = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch });
    setStatus(null);
  };

  const dirty = !same(draft, saved);
  const level = levelOf(draft);
  // what the save PLAYS at: its own level, or the top of the track while
  // the dev grant is open
  const plays = effectiveLevel(draft);
  const granted = plays > level;
  const { into, need } = levelProgress(draft.xp);
  const next = nextRewardLevel(Math.min(plays, MAX_LEVEL));

  const setXp = (xp: number) =>
    edit({ xp: Math.max(0, Math.min(xpAtLevel(LEVEL_CAP), Math.floor(xp))) });
  // a level is set by dropping the save on the FLOOR of it — the tidiest
  // XP total that reads as this level, and the one a player would recognise
  const setLevel = (l: number) => setXp(xpAtLevel(Math.max(1, Math.min(LEVEL_CAP, Math.floor(l)))));

  const apply = () => {
    saveProgress(draft);
    setSaved(draft);
    setStatus("Written to the save");
  };

  const wipe = () => {
    resetProgress();
    reload();
    setStatus("Save wiped");
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between gap-4">
        <p className="max-w-3xl text-[#71717C]">
          The one save slot, opened up. XP is the whole of a campaign&apos;s progress — the level
          is read off it, and the level is what opens maps, paces, turrets, modules and mutators.
          Edits are a draft until Apply; the game reads the save on load and on a timer, so a run
          already open picks this up when it next looks.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {status && <span className="text-[15px] text-[#71717C]">{status}</span>}
          <button onClick={() => { setDraft(saved); setStatus(null); }} disabled={!dirty} className={BTN}>
            Revert
          </button>
          <button
            onClick={apply}
            disabled={!dirty}
            className={`${BTN} border-[#4A4A55] text-[#EDEDEF] disabled:text-[#A6A6AF]`}
          >
            Apply
          </button>
        </div>
      </div>

      {/* ---------- the level ---------- */}
      <div className={CARD}>
        <div className={HEAD}>Level and XP</div>

        <div className="flex items-baseline gap-3">
          <span className="text-xl font-bold text-[#EDEDEF]">Level {level}</span>
          <span className="font-mono tabular-nums" style={{ color: XP_COLOR }}>
            {num(draft.xp)} XP
          </span>
          {level < LEVEL_CAP ? (
            <span className="text-[15px] text-[#71717C]">
              {num(into)} / {num(need)} into it · {num(need - into)} to level {level + 1}
            </span>
          ) : (
            <span className="text-[15px] text-[#71717C]">the cap — XP past it banks and does nothing</span>
          )}
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#0B0B0D]">
          <div
            className="h-full"
            style={{ width: `${Math.min(100, (into / need) * 100)}%`, background: XP_COLOR }}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="w-16 text-[15px] font-bold text-[#EDEDEF]">Level</span>
          <input
            type="range"
            value={Math.min(MAX_LEVEL, level)}
            min={1}
            max={MAX_LEVEL}
            step={1}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="flex-1 accent-[#FFD37F]"
          />
          <input
            type="number"
            value={level}
            min={1}
            max={LEVEL_CAP}
            step={1}
            onChange={(e) => Number.isFinite(Number(e.target.value)) && setLevel(Number(e.target.value))}
            className={FIELD}
          />
        </div>
        {/* the slider stops at the track's top because that is where the
            rewards stop; the field still reaches the cap, for testing the
            far end of the curve */}
        <div className="mt-1 pl-16 text-[13px] text-[#71717C]">
          The slider runs to {MAX_LEVEL}, the last level the track hands anything out at. The field
          takes anything up to {LEVEL_CAP}.
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="w-16 text-[15px] font-bold text-[#EDEDEF]">XP</span>
          <input
            type="number"
            value={draft.xp}
            min={0}
            step={1000}
            onChange={(e) => Number.isFinite(Number(e.target.value)) && setXp(Number(e.target.value))}
            className={`${FIELD} flex-1 text-left`}
          />
          <button onClick={() => setXp(draft.xp + xpToNext(level))} className={BTN}>
            +1 level
          </button>
          <button onClick={() => setLevel(level - 1)} disabled={level <= 1} className={BTN}>
            −1 level
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Jump level={1} note="fresh" onPick={() => setLevel(1)} />
          <Jump level={MUTATORS_FROM} note="mutators open" onPick={() => setLevel(MUTATORS_FROM)} />
          <Jump level={MAX_LEVEL} note="whole track" onPick={() => setLevel(MAX_LEVEL)} />
          <Jump level={LEVEL_CAP} note="cap" onPick={() => setLevel(LEVEL_CAP)} />
        </div>
      </div>

      {/* ---------- the dev grant ---------- */}
      <div className={CARD}>
        <div className={HEAD}>The dev grant</div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={!(draft.devGrantOff ?? false)}
            onChange={(e) => edit({ devGrantOff: !e.target.checked })}
            className="mt-1 h-4 w-4 accent-[#FFD37F]"
          />
          <span className="text-[15px] text-[#A6A6AF]">
            <span className="font-bold text-[#EDEDEF]">Play at the top of the track</span> — a dev
            build hands every save level {MAX_LEVEL} whatever its XP says, so any map and any
            difficulty can be reached without grinding first. Never in a shipped build.
          </span>
        </label>
        <div className="mt-3 border-t border-[#2E2E36] pt-3 text-[15px]">
          {granted ? (
            <span className="text-[#FFD37F]">
              The grant is open: this save is level {level} and PLAYS at {plays}. Switch it off to
              feel the level above.
            </span>
          ) : (
            <span className="text-[#71717C]">
              The grant is off: this save plays at level {plays}, its own.
            </span>
          )}
        </div>
      </div>

      {/* ---------- what the level buys ---------- */}
      <div className={CARD}>
        <div className={HEAD}>What level {plays} opens</div>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <div>
            <Tally label="Turrets on the roster" have={turretsAt(plays).size} all={FIELDED_KINDS.length} />
            <Tally label="Mods in the bag" have={modsAt(plays).size} all={MODS.length} />
            <Tally label="Relics in the bag" have={relicsAt(plays).size} all={RELICS.length} />
            <Tally label="Mutators in the deck" have={mutatorsAt(plays).size} all={MUTATIONS.length} />
            <Tally
              label="Maps open"
              have={WORLDS.filter((w) => worldUnlockLevel(w.id) <= plays).length}
              all={WORLDS.length}
            />
            <div className="flex items-baseline justify-between gap-3 border-t border-[#2E2E36] py-1.5">
              <span className="text-[#A6A6AF]">Paces</span>
              <span className="font-mono tabular-nums text-[#EDEDEF]">
                {speedsAt(plays).map((s) => `${s}x`).join(" · ")}
              </span>
            </div>
          </div>

          <div className="mt-4 sm:mt-0">
            {/* the ladder is the reason anyone comes to this page: the
                difficulties that ROLL RULES are the one thing a level gates */}
            <div className="mb-1 text-[15px] text-[#A6A6AF]">Difficulties</div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: RUNG_COUNT }, (_, t) => t).map((t) => {
                const open = difficultyOpen(plays, tierMutationCount(t));
                return (
                  <span
                    key={t}
                    className={`rounded border px-2 py-0.5 text-[13px] font-bold ${
                      open ? "border-[#4A4A55]" : "border-[#2E2E36] opacity-35"
                    }`}
                    style={{ color: open ? rungColor(t) : "#71717C" }}
                  >
                    {rungLabel(t)}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 text-[13px] text-[#71717C]">
              Everything above {rungLabel(XP_BASE_TIER)} rolls rules, and stays shut until level{" "}
              {MUTATORS_FROM} has rules to roll.
            </div>

            <div className="mt-4 border-t border-[#2E2E36] pt-3">
              <div className="mb-1 text-[15px] text-[#A6A6AF]">
                {next ? `Level ${next} hands out` : "The track is finished — nothing above this level"}
              </div>
              {next && (
                <ul className="text-[15px] text-[#EDEDEF]">
                  {rewardsAt(next).map((r, i) => (
                    <li key={i}>· {rewardText(r)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- the record ---------- */}
      <div className={CARD}>
        <div className={HEAD}>The record — the best difficulty beaten on each map</div>
        <p className="mb-2 text-[15px] text-[#71717C]">
          A record and never a gate: every difficulty is open from the first run, and this is only
          what the map list prints. 0 is never won on.
        </p>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          {WORLDS.map((w) => {
            const best = Math.max(0, Math.min(RUNG_COUNT, Math.floor(draft.clearedByMap[w.id] ?? 0)));
            return (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 border-t border-[#2E2E36] py-1.5"
              >
                <span className="truncate text-[#A6A6AF]">{w.name}</span>
                <span className="flex items-center gap-2">
                  <span
                    className="w-28 text-right text-[13px] font-bold"
                    style={{ color: best > 0 ? rungColor(best - 1) : "#71717C" }}
                  >
                    {best > 0 ? rungLabel(best - 1) : "unbeaten"}
                  </span>
                  <input
                    type="number"
                    value={best}
                    min={0}
                    max={RUNG_COUNT}
                    step={1}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(RUNG_COUNT, Math.floor(Number(e.target.value) || 0)));
                      const cleared = { ...draft.clearedByMap };
                      if (v > 0) cleared[w.id] = v;
                      else delete cleared[w.id];
                      edit({ clearedByMap: cleared });
                    }}
                    className="w-16 rounded border border-[#2E2E36] bg-[#0B0B0D] px-2 py-1 text-right font-mono text-[15px] tabular-nums text-[#EDEDEF]"
                  />
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2 border-t border-[#2E2E36] pt-3">
          <button onClick={() => edit({ clearedByMap: {} })} className={BTN}>
            Clear the record
          </button>
          <button
            onClick={() =>
              edit({
                clearedByMap: Object.fromEntries(WORLDS.map((w) => [w.id, RUNG_COUNT])),
              })
            }
            className={BTN}
          >
            Every map at {rungLabel(TOP_TIER)}
          </button>
        </div>
      </div>

      {/* ---------- the wipe ---------- */}
      <div className={CARD}>
        <div className={HEAD}>Wipe</div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-[15px] text-[#71717C]">
            Throw the save away and start a fresh campaign — XP, record and every setting. This one
            writes immediately; there is nothing to Apply. A wipe on a dev build also switches the
            grant OFF, so the fresh save is actually fresh.
          </p>
          <button
            onClick={wipe}
            className={`${BTN} shrink-0 border-[#5A2E2E] text-[#E48A8A] hover:border-[#7A3E3E] hover:text-[#FFB4B4]`}
          >
            Wipe the save
          </button>
        </div>
      </div>
    </div>
  );
}
