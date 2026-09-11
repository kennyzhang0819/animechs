"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { TOWER_DESC, TOWERS } from "@/game/constants";
import type { Game, UiState } from "@/game/game";
import { rarityDef } from "@/game/rarity";
import type { TowerKind } from "@/game/types";
import { TOWER_ICONS } from "./towerIcons";
import { HoverCard, useHoverCard } from "./HoverCard";

/**
 * THE DEAL — the roguelike door a charged run buys turrets through, and
 * everything the field's bottom-right corner is while one is being played.
 *
 * The command card (tech.ts BUILD_SLOTS) is gone from a real run. In its
 * place: two buttons, and the cards they throw.
 *
 *   BUY TURRET pays the roll fee (economy.ts rollPriceFor), rolls the
 *   rarity odds (rarity.ts) and POPS A CARD onto the field — the turret's
 *   sprite in the middle, its rarity's border round it, in the Plants vs
 *   Zombies shape every player already reads as "something is on offer,
 *   pick it up".
 *
 *   BUY UPGRADE is the second half of the same idea and is not built yet.
 *   It is on screen, dark, saying so — because the corner's LAYOUT is a
 *   promise about what a run is, and a button that appears later moves
 *   everything the hand has already learned.
 *
 * A CARD IS ON A CLOCK (CARD_LIFE). Ten seconds after it lands it is gone,
 * unclaimed and unrefunded, and the last three of those it blinks. That is
 * the whole tension of the button: a draw is not a purchase you think
 * about, it is a thing you catch.
 *
 * ...UNLESS IT IS IN HAND. The moment a card is PICKED the clock stops,
 * because the decision it is asking for has changed — it was "do you want
 * this", and now it is "where does this go", and that second question is
 * the one the game actually wants played well. A player should be able to
 * hold a spectre over the board, pan the camera, and put it exactly where
 * the lane bends without a timer arguing with them.
 */

/** how long an unclaimed card stands on the field, in seconds */
export const CARD_LIFE = 10;
/** ...and how much of that tail it spends blinking */
export const CARD_BLINK = 3;

/** one card on the field: what it carries, and how long it has left */
export interface DealCard {
  /** never reused — two cards of the same kind are two different cards */
  id: number;
  kind: TowerKind;
  /** seconds of life left; frozen while this card is the one in hand */
  left: number;
}

/**
 * THE DEAL'S STATE MACHINE, hung off the run's HUD poll.
 *
 * Everything here is UI: the sim knows nothing about cards, only that a
 * structure was placed (UiState.built) and that some scrap was spent
 * (Game.buyTurretCard). The two are stitched together by watching `built`
 * across the poll — a placement that happened between two polls still
 * moves the counter, which a callback fired from inside the canvas handler
 * could not be relied on to do.
 */
export function useDeal(
  gameRef: RefObject<Game | null>,
  hud: UiState | null,
  refresh: () => void,
): {
  cards: readonly DealCard[];
  picked: number | null;
  buy: () => void;
  pick: (id: number) => void;
} {
  const [cards, setCards] = useState<readonly DealCard[]>([]);
  /** which card is in hand — its clock is stopped and its ghost is on the board */
  const [picked, setPicked] = useState<number | null>(null);
  const nextId = useRef(1);
  const lastBuilt = useRef(0);

  const buildKind = hud?.buildKind ?? null;
  const built = hud?.built ?? 0;
  const over = !hud || hud.lost || hud.won;

  /**
   * THE CARD IN HAND IS SPENT WHEN THE GROUND TAKES IT. `built` going up
   * is the only proof of that — a press on ground that refuses the
   * footprint leaves the card in hand, which is what lets a player walk a
   * spectre around until it fits.
   *
   * A hand that empties WITHOUT the counter moving is a cancel (right
   * click, or the same card clicked twice): the card goes back on the
   * field and its clock starts again where it stopped.
   */
  useEffect(() => {
    if (built === lastBuilt.current) {
      if (picked !== null && buildKind === null) setPicked(null);
      return;
    }
    lastBuilt.current = built;
    if (picked === null) return;
    const id = picked;
    setPicked(null);
    setCards((cs) => cs.filter((c) => c.id !== id));
  }, [built, picked, buildKind]);

  /** the run ending takes the field's cards with it */
  useEffect(() => {
    if (!over) return;
    setCards([]);
    setPicked(null);
  }, [over]);

  /**
   * THE CLOCK, a tenth of a second at a time. The card in hand is skipped
   * — that is the freeze — and anything that runs out is simply gone.
   * It does not run while the game is paused or the menu is up: a card is
   * a thing on the FIELD, and the field is stopped.
   */
  const frozen = picked;
  const running = !over && !(hud?.paused ?? false) && !(hud?.menuOpen ?? false);
  useEffect(() => {
    if (!running || cards.length === 0) return;
    const t = setInterval(() => {
      setCards((cs) => {
        let changed = false;
        const next: DealCard[] = [];
        for (const c of cs) {
          if (c.id === frozen) {
            next.push(c);
            continue;
          }
          const left = c.left - 0.1;
          changed = true;
          if (left > 0) next.push({ ...c, left });
        }
        return changed ? next : cs;
      });
    }, 100);
    return () => clearInterval(t);
  }, [running, frozen, cards.length]);

  const buy = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const kind = g.buyTurretCard();
    if (!kind) return;
    setCards((cs) => [...cs, { id: nextId.current++, kind, left: CARD_LIFE }]);
    refresh();
  }, [gameRef, refresh]);

  const pick = useCallback(
    (id: number) => {
      const g = gameRef.current;
      if (!g) return;
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      // the lit card clicked again puts it back down — the same toggle the
      // command card's slots have always had
      const drop = picked === id;
      g.setBuildKind(drop ? null : card.kind);
      setPicked(drop ? null : id);
      refresh();
    },
    [cards, picked, gameRef, refresh],
  );

  return { cards, picked, buy, pick };
}

/**
 * ONE CARD. The turret's sprite on a wash of its rarity's colour, that
 * colour's border round it, the name under it, and a hairline of clock
 * along the bottom edge.
 *
 * THE BORDER IS THE WHOLE POINT of the rarity system on this screen: a
 * player mid-wave has no time to read a word, and the difference between
 * grey and purple lands before the eye reaches the sprite. The name is
 * there for the second glance and the hover card for the third.
 */
function TurretCard({
  card,
  icon,
  held,
  onPick,
}: {
  card: DealCard;
  icon: string;
  held: boolean;
  onPick: () => void;
}) {
  const tip = useHoverCard("up");
  const r = rarityDef(card.kind);
  const stats = TOWERS[card.kind];
  const blinking = !held && card.left <= CARD_BLINK;
  return (
    <button
      ref={tip.ref as RefObject<HTMLButtonElement | null>}
      {...tip.anchorProps}
      onClick={onPick}
      aria-label={`${stats.name}, ${r.name}${held ? ", in hand" : ""}`}
      aria-pressed={held}
      className={`ms-deal-card relative flex h-[4.6rem] w-[3.4rem] shrink-0 flex-col items-center justify-center gap-0.5 border-2 p-0 ${
        blinking ? "ms-deal-blink" : ""
      } ${held ? "ms-deal-held" : ""}`}
      style={{ borderColor: r.color, background: r.wash, color: r.color }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
      <img src={icon} alt="" className="h-8 w-8 [image-rendering:pixelated]" />
      <span className="max-w-full truncate px-0.5 text-[9px] font-bold uppercase leading-none tracking-wide">
        {stats.name}
      </span>
      {/* THE CLOCK, along the foot of the card: a bar rather than a number,
          because what a player needs off it is "how much of that is left"
          and never "how many seconds". It is full and still on a card in
          hand, which is the freeze made visible */}
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-[3px] w-full bg-black/45"
      >
        <span
          className="block h-full"
          style={{
            width: `${Math.max(0, Math.min(1, card.left / CARD_LIFE)) * 100}%`,
            background: r.color,
          }}
        />
      </span>
      <HoverCard tip={tip} title={stats.name} tag={r.name} color={r.color} align="right">
        {TOWER_DESC[card.kind]}
        <span className="mt-1.5 block text-[#EDEDEF]">
          {held ? "In hand — click the board to place it." : "Click to pick it up."}
        </span>
      </HoverCard>
    </button>
  );
}

/** the two buttons, and the cards standing over them */
export function DealCorner({
  hud,
  icons,
  cards,
  picked,
  onBuy,
  onPick,
}: {
  hud: UiState;
  icons: Partial<Record<TowerKind, string>>;
  cards: readonly DealCard[];
  picked: number | null;
  onBuy: () => void;
  onPick: (id: number) => void;
}) {
  const poor = hud.scrap !== null && hud.scrap < hud.rollPrice;
  return (
    <div className="flex flex-col items-end gap-2">
      {/* THE CARDS, growing LEFTWARD off the buttons that threw them: a
          row that wraps upward when a fast hand has bought more than it
          has placed. Newest nearest the button, which is where the eye
          already is when one lands */}
      {cards.length > 0 && (
        <div
          role="list"
          aria-label="turret cards"
          className="pointer-events-auto flex max-w-[26rem] flex-row-reverse flex-wrap-reverse justify-start gap-1.5"
        >
          {[...cards].reverse().map((c) => (
            <TurretCard
              key={c.id}
              card={c}
              icon={icons[c.kind] ?? TOWER_ICONS[c.kind]}
              held={picked === c.id}
              onPick={() => onPick(c.id)}
            />
          ))}
        </div>
      )}
      <div className="ms-pane pointer-events-auto flex w-[13rem] flex-col gap-1 p-1">
        <button
          className={`ms-btn h-9 w-full justify-between px-2 text-[13px] font-bold uppercase tracking-wide ${
            poor ? "opacity-60" : ""
          }`}
          onClick={onBuy}
          aria-label={`Buy turret for ${hud.rollPrice} scrap`}
        >
          <span>Buy turret</span>
          {hud.scrap !== null && (
            <span className={poor ? "text-[#FF8A8A]" : "text-white"}>{hud.rollPrice}</span>
          )}
        </button>
        {/* not built yet, and on screen anyway — see the header */}
        <button
          className="ms-btn h-9 w-full cursor-not-allowed justify-between px-2 text-[13px] font-bold uppercase tracking-wide opacity-45"
          disabled
          aria-label="Buy upgrade — not available yet"
        >
          <span>Buy upgrade</span>
          <span className="text-[11px] tracking-normal text-[#A6A6AF]">Soon</span>
        </button>
      </div>
    </div>
  );
}
