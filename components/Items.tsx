"use client";

import {
  levelProgress,
  POINT_COLOR,
  SCRAP_COLOR,
  SCRAP_ICON,
  XP_COLOR,
} from "@/game/economy";

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
  tone,
  className = "",
}: {
  amount: number;
  size?: Size;
  /** the run can't cover this amount — draw it as a shortfall */
  short?: boolean;
  /**
   * PAINT THE NUMBER THIS INSTEAD OF the scrap tint — for the one place a
   * count sits in a row with another number and has to match it rather
   * than stand out from it (the HUD's clock row over the minimap). The
   * sprite in front of it is what says "scrap" there; two different
   * colours on one row only said "these are two unrelated things".
   * A shortfall still overrides it: that is not decoration.
   */
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-bold ${className}`}
      style={{ color: short ? "#FF8A8A" : (tone ?? SCRAP_COLOR) }}
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
 * THE LEVEL STRIP: the player's level, and only that. The bar to the next
 * level and what it hands out live on the progress screen, one press
 * away; the menu names the number and nothing else.
 */
export function LevelStrip({ xp }: { xp: number }) {
  const { level } = levelProgress(xp);
  return (
    <span className="font-bold uppercase tracking-widest text-[#EDEDEF]">
      Level <span style={{ color: POINT_COLOR }}>{level}</span>
    </span>
  );
}
