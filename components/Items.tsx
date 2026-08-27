"use client";

import { costEntries, ITEM_INFO, ITEM_KINDS, type Bank, type Cost, type ItemKind } from "@/game/items";

/* eslint-disable @next/next/no-img-element -- raw pixel sprites, no optimization wanted */

const SIZES = { sm: "h-4 w-4", md: "h-5 w-5" } as const;

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
      {amount}
    </span>
  );
}

/**
 * A price or a payout, one stack per currency it mentions. Pass `bank` and
 * every stack the wallet can't cover turns red on its own, so a cost that
 * fails on titanium alone says exactly that instead of just "too expensive".
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
 * The wallet strip. Currencies the player has never earned stay hidden —
 * scrap is always shown so a fresh save isn't a blank box, and copper,
 * titanium and everything past them appear the first time a kill drops one.
 */
export function Wallet({ bank, size = "md" }: { bank: Bank; size?: keyof typeof SIZES }) {
  const held = ITEM_KINDS.filter((k) => k === "scrap" || bank[k] > 0);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
      {held.map((k) => (
        <ItemAmount key={k} item={k} amount={bank[k]} size={size} />
      ))}
    </span>
  );
}
