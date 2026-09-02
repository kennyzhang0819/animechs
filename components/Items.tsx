"use client";

import { BASE_ITEM, costEntries, ITEM_INFO, ITEM_KINDS, type Bank, type Cost, type ItemKind } from "@/game/items";

/* eslint-disable @next/next/no-img-element -- raw pixel sprites, no optimization wanted */

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

/**
 * A COUNT AS A STACK READS IT. Late-campaign banks run to eight and nine
 * digits, and a wallet strip that prints 1,284,301,776 is a number nobody
 * reads and a strip that wraps onto three lines — so past a million the
 * count is abbreviated to one decimal: 1.3m, 4.0b.
 *
 * IT STARTS AT A MILLION, NOT A THOUSAND, deliberately. A price of 1,200
 * copper is a price a player counts against a bank of 3,400; rounding
 * those to 1.2k and 3.4k would blur the exact comparison the shop is for,
 * and nothing under a million is too long to print in full.
 */
export const itemCount = (n: number): string =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)}b`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}m`
      : Math.round(n).toLocaleString();

/** one currency's sprite and amount, tinted with that item's colour */
export function ItemAmount({
  item,
  amount,
  size = "sm",
  short,
}: {
  item: ItemKind;
  amount: number;
  size?: keyof typeof SIZES;
  /** the player can't cover this amount — draw it as a shortfall */
  short?: boolean;
}) {
  const info = ITEM_INFO[item];
  return (
    <span
      className="inline-flex items-center gap-1 font-bold"
      style={{ color: short ? "#FF8A8A" : info.color }}
      title={info.name}
    >
      <img
        src={info.icon}
        alt={info.name}
        className={`${SIZES[size]} shrink-0 [image-rendering:pixelated] ${short ? "opacity-70" : ""}`}
      />
      {itemCount(amount)}
    </span>
  );
}

/**
 * A price or a payout, one stack per currency it mentions. Pass `bank` and
 * every stack the wallet can't cover turns red on its own, so a cost that
 * fails on thorium alone says exactly that instead of just "too expensive".
 */
export function CostRow({
  cost,
  bank,
  size = "sm",
  className = "",
}: {
  cost: Cost;
  bank?: Bank;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const entries = costEntries(cost);
  if (entries.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      {entries.map(({ item, amount }) => (
        <ItemAmount
          key={item}
          item={item}
          amount={amount}
          size={size}
          short={bank ? bank[item] < amount : false}
        />
      ))}
    </span>
  );
}

/**
 * The wallet strip. Currencies with a zero balance stay hidden — the base
 * item is always shown so a fresh save isn't a blank box, and the rest
 * appear while a kill's drops keep them above zero.
 */
export function Wallet({
  bank,
  size = "md",
  vertical = false,
}: {
  bank: Bank;
  size?: keyof typeof SIZES;
  /** stack one currency per line instead of the flowing strip */
  vertical?: boolean;
}) {
  const held = ITEM_KINDS.filter((k) => k === BASE_ITEM || bank[k] > 0);
  return (
    <span
      className={
        vertical
          ? "inline-flex flex-col items-start gap-y-1"
          : "inline-flex flex-wrap items-center gap-x-4 gap-y-1"
      }
    >
      {held.map((k) => (
        <ItemAmount key={k} item={k} amount={bank[k]} size={size} />
      ))}
    </span>
  );
}
