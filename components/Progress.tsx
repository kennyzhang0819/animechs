"use client";

import { useRef, useState } from "react";
import { levelProgress, POINT_COLOR, XP_COLOR } from "@/game/economy";
import { effectiveLevel, levelOf, type Progress } from "@/game/progress";
import { MAX_LEVEL, rewardText, TRACK, type Reward } from "@/game/track";
import { BackButton, BoardTabs, type Cam } from "./Board";
import { itemCount, LevelStrip } from "./Items";
import MutationTree from "./MutationTree";
import { MUT_GLYPH, MUT_LIT } from "./mutationFace";

/**
 * THE PROGRESS SCREEN: the track, top to bottom.
 *
 * One list, thirty rows, each row a level and what reaching it hands out
 * (track.ts). The rows the save has reached are lit, the one it is on is
 * marked with how far along it is, and everything above is what there is
 * still to earn — the whole progression readable in one scroll, the way a
 * commander's level list is. Nothing here is a button: the track is not
 * spent, it is climbed.
 *
 * The mutator codex rides beside it as a second tab, exactly as it did
 * beside the old tree — the answer to "is this worth it" is "what can be
 * done to me", and that lives on the other board.
 */

const TRACK_GLYPH = "M3 19h18v2H3zM3 6l5 4 4-7 4 7 5-4-2 11H5z";
const TABS = [
  { id: "track", label: "Progress", color: "#FFD37F", glyph: TRACK_GLYPH },
  { id: "mutators", label: "Mutators", color: MUT_LIT, glyph: MUT_GLYPH },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** the colour a reward chip wears, by what it is */
const REWARD_COLOR: Record<Reward["kind"], string> = {
  world: "#7BE58A",
  speed: "#7FC4FF",
  upgrade: "#FFD37F",
};

function RewardChip({ reward, reached }: { reward: Reward; reached: boolean }) {
  return (
    <span
      className={`ms-badge inline-flex items-center gap-1 ${reached ? "" : "opacity-50"}`}
      style={{ color: REWARD_COLOR[reward.kind] }}
    >
      {rewardText(reward)}
    </span>
  );
}

export default function ProgressView({
  progress,
  onBack,
  backLabel = "Back",
}: {
  progress: Progress;
  onBack: () => void;
  backLabel?: string;
}) {
  const [tab, setTab] = useState<TabId>("track");
  const codexCam = useRef<Cam | null>(null);
  const tabStrip = <BoardTabs tabs={TABS} active={tab} onPick={setTab} />;

  if (tab === "mutators")
    return <MutationTree onBack={onBack} backLabel={backLabel} tabs={tabStrip} cam={codexCam} />;

  const level = levelOf(progress);
  // what the save PLAYS at — the whole track while the back door is open
  const plays = effectiveLevel(progress);
  const { into, need } = levelProgress(progress.xp);
  // the dev switch plays every save at the top of the track (progress.ts)
  const door = plays > level;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0B0B0D] text-[#EDEDEF]">
      {/* the chrome: back, the strip, the tabs — pinned, the list scrolls under it */}
      <div className="flex flex-wrap items-center gap-3 px-[calc(1rem+var(--safe-l))] pr-[calc(1rem+var(--safe-r))] pt-[calc(1rem+var(--safe-t))] pb-3">
        <BackButton label={backLabel} onClick={onBack} />
        <span className="ms-pane flex items-center px-4 py-2">
          <LevelStrip xp={progress.xp} />
        </span>
        <div className="ml-auto">{tabStrip}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[calc(1rem+var(--safe-l))] pb-[calc(1.5rem+var(--safe-b))] pr-[calc(1rem+var(--safe-r))]">
        <div className="mx-auto max-w-2xl">
          {door && (
            <p className="mb-3 text-[12px] uppercase tracking-widest text-[#7BE58A]">
              Full unlock is on — every row below reads as reached
            </p>
          )}
          <ol className="space-y-1.5">
            {TRACK.map(({ level: l, rewards }) => {
              const reached = l <= plays;
              const current = l === level && !door;
              const top = l === MAX_LEVEL;
              return (
                <li
                  key={l}
                  aria-current={current ? "step" : undefined}
                  className={`ms-pane flex items-start gap-4 px-4 py-2.5 ${
                    current ? "border-[#FFD37F]" : reached ? "" : "opacity-70"
                  }`}
                >
                  <div className="w-16 shrink-0">
                    <div className="text-[10px] uppercase tracking-widest text-[#71717C]">
                      Level
                    </div>
                    <div
                      className="font-display text-xl font-bold leading-none"
                      style={{ color: reached ? POINT_COLOR : "#71717C" }}
                    >
                      {l}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {rewards.length === 0 ? (
                      <span className="text-[12px] text-[#71717C]">
                        {l === 1 ? "Every turret, every attempt. The rest is earned." : "—"}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {rewards.map((r, i) => (
                          <RewardChip key={i} reward={r} reached={reached} />
                        ))}
                      </div>
                    )}
                    {/* the row the save is ON carries the bar to the next one —
                        the one number on this screen that moves */}
                    {current && !top && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-[#A6A6AF]">
                        <span className="ms-bar h-1.5 w-40">
                          <span
                            className="block h-full"
                            style={{
                              width: `${Math.min(100, (100 * into) / Math.max(1, need))}%`,
                              background: XP_COLOR,
                            }}
                          />
                        </span>
                        {itemCount(into)} / {itemCount(need)} XP to level {l + 1}
                      </div>
                    )}
                    {current && top && (
                      <div className="mt-1 text-[11px] uppercase tracking-widest text-[#7BE58A]">
                        Top of the track
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
