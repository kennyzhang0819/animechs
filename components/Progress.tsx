"use client";

import { useRef, useState } from "react";
import { levelProgress, POINT_COLOR, XP_COLOR } from "@/game/economy";
import { effectiveLevel, levelOf, type Progress } from "@/game/progress";
import { MAX_LEVEL, rewardBlurb, rewardText, TRACK, type Reward } from "@/game/track";
import { BackButton, BoardTabs, type Cam } from "./Board";
import { HoverCard, useHoverCard } from "./HoverCard";
import { itemCount } from "./Items";
import MutationTree from "./MutationTree";
import { MUT_GLYPH, MUT_LIT } from "./mutationFace";

/**
 * THE PROGRESS SCREEN: the track, centred on where the save stands.
 *
 * One list, thirty rows, each row a level and what reaching it hands out
 * (track.ts). The level the save is ON sits in the middle of the screen
 * with its bar to the next one, and the rest of the track expands out from
 * it: the levels already climbed fade off above, the ones still to earn
 * fade off below. NOTHING SCROLLS. What fits on the screen is what is
 * shown, because the question this screen answers is "where am I and what
 * is next", and both are within a glance of the centre. Nothing here is a
 * button: the track is not spent, it is climbed.
 *
 * The mutator codex rides beside it as a second tab, exactly as it did
 * beside the old tree — the answer to "is this worth it" is "what can be
 * done to me", and that lives on the other board. The tab strip sits in
 * the SAME corner on both boards, beside back, so switching never moves
 * the hand.
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
  turret: "#FF9A62",
  upgrade: "#FFD37F",
};

/**
 * One reward on a track row, with WHAT IT DOES a hover away: the chip
 * names the thing ("Duo: Rate of Fire") and the card that opens on it
 * says the effect in a sentence (rewardBlurb). Focusable, so the keyboard
 * gets the same card the mouse does.
 *
 * The card is the shared HoverCard, portalled onto the body (see that
 * file for why): nothing in the track — its edge masks, a dimmed row —
 * can fade it. It opens up from a climbed row and down from a row ahead
 * (`dir`), which keeps it on the screen at either end of the list.
 */
function RewardChip({
  reward,
  reached,
  dir,
}: {
  reward: Reward;
  reached: boolean;
  /** which way the card opens — see TrackRow for why it is not always up */
  dir: "up" | "down";
}) {
  const color = REWARD_COLOR[reward.kind];
  const text = rewardText(reward);
  const tip = useHoverCard(dir);
  return (
    <>
      <span
        ref={tip.ref}
        tabIndex={0}
        aria-label={`${text}. ${rewardBlurb(reward)}`}
        {...tip.anchorProps}
        className={`ms-badge inline-flex cursor-default items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
          reached ? "" : "opacity-50"
        }`}
        style={{ color }}
      >
        {text}
      </span>
      <HoverCard tip={tip} title={text} color={color}>
        {rewardBlurb(reward)}
      </HoverCard>
    </>
  );
}

/** one level of the track: its number, its rewards, and — on the row the
 *  save is on — the bar to the next one, the one number here that moves */
function TrackRow({
  level,
  rewards,
  reached,
  current,
  into,
  need,
  dir,
}: {
  level: number;
  rewards: readonly Reward[];
  reached: boolean;
  current: boolean;
  into: number;
  need: number;
  /** is this row above the save's level (a climbed one) or at or below it? */
  dir: "up" | "down";
}) {
  const top = level === MAX_LEVEL;
  return (
    <div
      role="listitem"
      aria-current={current ? "step" : undefined}
      // an unreached row is dimmed through its CONTENT (the grey number,
      // the half-faded chips), never through the row's own opacity, so
      // nothing it holds is read through
      className={`ms-pane flex items-start gap-4 px-4 py-2.5 ${
        current ? "border-[#FFD37F]" : reached ? "" : "border-[#252525]"
      }`}
    >
      <div className="w-16 shrink-0">
        <div className="text-[12px] uppercase tracking-widest text-[#71717C]">Level</div>
        <div
          className="font-display text-xl font-bold leading-none"
          style={{ color: reached ? POINT_COLOR : "#71717C" }}
        >
          {level}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        {rewards.length === 0 ? (
          <span className="text-[14px] text-[#71717C]">
            —
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {rewards.map((r, i) => (
              <RewardChip key={i} reward={r} reached={reached} dir={dir} />
            ))}
          </div>
        )}
        {current && !top && (
          <div className="mt-3 flex items-center gap-3 text-[14px] text-[#A6A6AF]">
            <span className="ms-bar h-4 w-64 max-w-full">
              <span
                className="block h-full"
                style={{
                  width: `${Math.min(100, (100 * into) / Math.max(1, need))}%`,
                  background: XP_COLOR,
                }}
              />
            </span>
            {itemCount(into)} / {itemCount(need)} XP to level {level + 1}
          </div>
        )}
        {current && top && (
          <div className="mt-1 text-[13px] uppercase tracking-widest text-[#7BE58A]">
            Top of the track
          </div>
        )}
      </div>
    </div>
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

  const row = (l: number) => {
    const { rewards } = TRACK[l - 1];
    return (
      <TrackRow
        key={l}
        level={l}
        rewards={rewards}
        reached={l <= plays}
        current={l === level && !door}
        into={into}
        need={need}
        dir={l <= level ? "up" : "down"}
      />
    );
  };
  const climbed = TRACK.filter((t) => t.level < level).map((t) => row(t.level));
  const ahead = TRACK.filter((t) => t.level > level).map((t) => row(t.level));

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0B0B0D] text-[#EDEDEF]">
      {/* the chrome: back and the tabs, in the corner the codex board pins
          them to as well (MutationTree), so the switch never moves. Both
          the chrome and the track opt into the UI-size knob (ui-zoom):
          this screen is read, not played, and a HUD set to 150% for a TV
          wants its progress list at 150% too */}
      <div className="ui-zoom absolute left-[1rem] top-[1rem] z-10 flex items-center gap-2">
        <BackButton label={backLabel} onClick={onBack} />
        {tabStrip}
        {door && (
          <span className="ml-2 text-[14px] uppercase tracking-widest text-[#7BE58A]">
            Full unlock is on — every row reads as reached
          </span>
        )}
      </div>

      {/* THE TRACK, PINNED TO ITS CENTRE. The row the save is on stays in
          the middle of the screen; the rows above stack up from it and
          the rows below stack down, each half clipped and faded at the
          edge of the screen rather than scrolled. */}
      <div role="list" className="ui-zoom mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-[calc(1rem+var(--safe-l))] pr-[calc(1rem+var(--safe-r))]">
        <div
          className="flex min-h-0 flex-1 flex-col justify-end gap-1.5 overflow-hidden pb-1.5 pt-[calc(4.5rem+var(--safe-t))]"
          style={{ maskImage: "linear-gradient(to bottom, transparent 4rem, black 45%)" }}
        >
          {climbed}
        </div>
        {row(level)}
        <div
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden pt-1.5 pb-[calc(1rem+var(--safe-b))]"
          style={{ maskImage: "linear-gradient(to top, transparent, black 45%)" }}
        >
          {ahead}
        </div>
      </div>
    </div>
  );
}
