"use client";

import {
  levelProgress,
  POINT_COLOR,
  SCRAP_COLOR,
  SCRAP_ICON,
  XP_COLOR,
  type Drop,
} from "@/game/economy";
import { nextRewardLevel, rewardsAt, rewardText } from "@/game/track";

/* eslint-disable @next/next/no-img-element -- raw pixel sprites, no optimization wanted */

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5" } as const;
type Size = keyof typeof SIZES;

/**
 * A COUNT AS A STACK READS IT. Lifetime XP runs to seven and eight
 * digits, and a strip that prints 12,840,301 is a number nobody reads —
 * so past a million the count is abbreviated to one decimal: 1.3m.
 *
 * IT STARTS AT A MILLION, NOT A THOUSAND, deliberately. A price of 1,200
 * scrap is a price a player counts against 3,400 in hand; rounding those
 * to 1.2k and 3.4k would blur the exact comparison the bar is for, and
 * nothing under a million is too long to print in full.
 */
export const itemCount = (n: number): string =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)}b`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}m`
      : Math.round(n).toLocaleString();

/** the XP star — there is no Mindustry item for experience */
function XpStar({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
      />
    </svg>
  );
}

/** scrap, as the bar and the HUD print it — tinted, sprite first */
export function ScrapAmount({
  amount,
  size = "sm",
  short,
  className = "",
}: {
  amount: number;
  size?: Size;
  /** the run can't cover this amount — draw it as a shortfall */
  short?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold ${className}`}
      style={{ color: short ? "#FF8A8A" : SCRAP_COLOR }}
      title="Scrap"
    >
      <img
        src={SCRAP_ICON}
        alt="Scrap"
        className={`${SIZES[size]} shrink-0 [image-rendering:pixelated] ${short ? "opacity-70" : ""}`}
      />
      {itemCount(amount)}
    </span>
  );
}

/** experience, wherever a run's takings or a save's total are printed */
export function XpAmount({
  amount,
  size = "sm",
  className = "",
}: {
  amount: number;
  size?: Size;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold ${className}`}
      style={{ color: XP_COLOR }}
      title="Experience"
    >
      <XpStar className={SIZES[size]} />
      {itemCount(amount)} XP
    </span>
  );
}

/**
 * A drop — what a wave, a stage or a run pays — as its two stacks. Either
 * half hides when it is zero, so a row never prints "0 XP".
 */
export function DropRow({
  drop,
  size = "sm",
  className = "",
}: {
  drop: Drop;
  size?: Size;
  className?: string;
}) {
  if (drop.scrap <= 0 && drop.xp <= 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {drop.scrap > 0 && <ScrapAmount amount={drop.scrap} size={size} />}
      {drop.xp > 0 && <XpAmount amount={drop.xp} size={size} />}
    </span>
  );
}

/**
 * THE LEVEL STRIP: the player's level, the XP bar to the next one, and
 * the next thing the track hands out. It is the one thing every menu
 * shows beside the way to read it (the progress screen), and the one
 * number a results screen is about.
 */
export function LevelStrip({ xp }: { xp: number }) {
  const { level, into, need } = levelProgress(xp);
  const nextAt = nextRewardLevel(level);
  const next = nextAt === null ? [] : rewardsAt(nextAt);
  return (
    <span className="inline-flex items-center gap-3">
      <span className="font-bold uppercase tracking-widest text-[#EDEDEF]">
        Level <span style={{ color: POINT_COLOR }}>{level}</span>
      </span>
      <span
        className="ms-bar h-2 w-24"
        title={`${itemCount(into)} / ${itemCount(need)} XP to level ${level + 1}`}
        aria-label={`${itemCount(into)} of ${itemCount(need)} XP to level ${level + 1}`}
      >
        <span
          className="block h-full"
          style={{ width: `${Math.min(100, (100 * into) / Math.max(1, need))}%`, background: XP_COLOR }}
        />
      </span>
      {/* the next unlock, named: what the bar is FOR. Past the top of the
          track there is nothing to name and the strip says so */}
      <span className="text-[11px] uppercase tracking-widest text-[#71717C]">
        {nextAt === null ? (
          "Top of the track"
        ) : (
          <>
            Level {nextAt}:{" "}
            <span className="text-[#A6A6AF]">
              {next
                .slice(0, 2)
                .map(rewardText)
                .join(", ")}
              {next.length > 2 ? ` +${next.length - 2}` : ""}
            </span>
          </>
        )}
      </span>
    </span>
  );
}
