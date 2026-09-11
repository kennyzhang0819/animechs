"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { TOWER_DESC, TOWERS } from "@/game/constants";
import { formationDef, type FormationId } from "@/game/formation";
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
 *   BUY TURRET (T) pays a flat fee (economy.ts TURRET_ROLL_PRICE), rolls
 *   TWO tables — which turret (rarity.ts) and what shape of it
 *   (formation.ts) — and POPS A CARD onto the field, in the Plants vs
 *   Zombies shape every player already reads as "something is on offer,
 *   pick it up". The card wears its rarity as a border, its slot number
 *   in one corner and a diagram of its formation in the other.
 *
 *   BUY UPGRADE (G) is the second half of the same idea and is not built
 *   yet. It is on screen, dark, saying so — because the corner's LAYOUT
 *   is a promise about what a run is, and a button that appears later
 *   moves everything the hand has already learned.
 *
 * THE HAND IS TEN SLOTS AND THE KEYS ARE 1 TO 0. A slot is a POSITION,
 * not a card: place the card in slot 1 and everything shifts down, so the
 * next one is in slot 1 too. That is the whole point of numbering them —
 * a full hand empties as 1, click, 1, click, 1, click, without the eye
 * ever leaving the board to check what moved where.
 *
 * A CARD IS ON A CLOCK (CARD_LIFE). Ten seconds after it lands it is
 * gone, unclaimed and unrefunded, and the last three of those it blinks.
 * That is the whole tension of the button: a draw is not a purchase you
 * think about, it is a thing you catch.
 *
 * ...UNLESS IT IS IN HAND. The moment a card is PICKED the clock stops,
 * because the decision it is asking for has changed — it was "do you want
 * this", and now it is "where does this go", and that second question is
 * the one the game actually wants played well. A player should be able to
 * hold a snowflake of spectres over the board, pan the camera, and find
 * the junction it fits on without a timer arguing with them.
 */

/** how long an unclaimed card stands on the field, in seconds */
export const CARD_LIFE = 10;
/** ...and how much of that tail it spends blinking */
export const CARD_BLINK = 3;
/**
 * HOW MANY CARDS THE HAND HOLDS. Ten because there are ten digits: every
 * slot a player can hold is a slot they can reach without a modifier, and
 * a hand with an eleventh card in it would have one they could only click.
 */
export const HAND_MAX = 10;

/** the key that fills slot i — 1..9 then 0, as a keyboard reads them */
export const slotLabel = (i: number): string => String((i + 1) % 10);
const slotCode = (i: number): string => `Digit${slotLabel(i)}`;

/** one card on the field: what it carries, and how long it has left */
export interface DealCard {
  /** never reused — two cards of the same turret are two different cards */
  id: number;
  kind: TowerKind;
  form: FormationId;
  /** seconds of life left; frozen while this card is the one in hand */
  left: number;
}

/**
 * THE DEAL'S STATE MACHINE, hung off the run's HUD poll.
 *
 * Everything here is UI: the sim knows nothing about cards, only that
 * structures were placed (UiState.built) and that some scrap was spent
 * (Game.buyTurretCard). The two are stitched together by watching `built`
 * across the poll — a placement that happened between two polls still
 * moves the counter, which a callback fired from inside the canvas
 * handler could not be relied on to do.
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
  full: boolean;
} {
  const [cards, setCards] = useState<readonly DealCard[]>([]);
  /** which card is in hand — its clock is stopped and its ghost is on the board */
  const [picked, setPicked] = useState<number | null>(null);
  const nextId = useRef(1);
  const lastBuilt = useRef(0);

  const buildKind = hud?.buildKind ?? null;
  const built = hud?.built ?? 0;
  const over = !hud || hud.lost || hud.won;
  const dealing = hud?.dealing ?? false;

  /**
   * THE CARD IN HAND IS SPENT WHEN THE GROUND TAKES IT. `built` going up
   * is the only proof of that — a press on ground that takes none of the
   * formation leaves the card in hand, which is what lets a player walk a
   * bastion around until it fits.
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

  const full = cards.length >= HAND_MAX;
  /** the hand's depth as of RIGHT NOW, not as of the last render: two T
   *  presses in one frame must not both get past the cap */
  const held = useRef(0);
  held.current = cards.length;

  const buy = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    // A FULL HAND BUYS NOTHING, and is refused before a single scrap is
    // spent: the roll happens inside the Game, and asking it first and
    // then discarding the answer would charge for a card that never landed
    if (held.current >= HAND_MAX) return;
    const drawn = g.buyTurretCard();
    if (!drawn) return;
    held.current++;
    setCards((cs) => [
      ...cs,
      { id: nextId.current++, kind: drawn.kind, form: drawn.form, left: CARD_LIFE },
    ]);
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
      g.setBuildKind(drop ? null : card.kind, drop ? null : card.form);
      setPicked(drop ? null : id);
      refresh();
    },
    [cards, picked, gameRef, refresh],
  );

  /**
   * THE KEYBOARD, and the reason the slots are numbered at all: T deals,
   * G is the upgrade button when there is one, and 1 to 0 pick the card
   * standing in that slot. The digits were left free on purpose when the
   * command card's letters were laid out (tech.ts), and this is what they
   * were being left free FOR.
   *
   * It declines the same presses the buttons would: a modifier held (ctrl
   * and cmd belong to the browser and the system), a text field focused,
   * the run over or the pause menu up. And it is off entirely on a free
   * board, where T and G are two of the command card's own letters.
   */
  useEffect(() => {
    if (!dealing || over) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, [contenteditable]")
      )
        return;
      const g = gameRef.current;
      if (!g || g.ui().menuOpen) return;
      if (e.code === "KeyT") {
        e.preventDefault();
        buy();
        return;
      }
      // G is the upgrade button, and the upgrade button does nothing yet.
      // It is swallowed anyway so the key is DEAD rather than wrong the
      // day it starts working — a player who learns it now learns it once
      if (e.code === "KeyG") {
        e.preventDefault();
        return;
      }
      const slot = cards.findIndex((_, i) => slotCode(i) === e.code);
      if (slot < 0) return;
      e.preventDefault();
      pick(cards[slot].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealing, over, cards, buy, pick, gameRef]);

  return { cards, picked, buy, pick, full };
}

/**
 * THE FORMATION, AS A PICTURE (formation.ts): the shape's own grid, a
 * filled square per turret in it, in the card's top-right corner.
 *
 * It is a diagram and not a word because it is read at a glance beside
 * nine others — "Snowflake" and "Bastion" are names a player has to have
 * learned, and a picture of thirteen squares in a star is not. The hover
 * card carries the name and the count for the second look.
 */
function FormationMark({ form, color }: { form: FormationId; color: string }) {
  const f = formationDef(form);
  const n = Math.max(f.w, f.h);
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      aria-hidden="true"
      className="pointer-events-none absolute right-[2px] top-[2px] h-[14px] w-[14px]"
    >
      {/* centred in a square viewBox, so a 2x2 and a 5x5 are drawn at the
          same scale and the difference between them IS the picture */}
      <g transform={`translate(${(n - f.w) / 2} ${(n - f.h) / 2})`}>
        {f.cells.map(([x, y]) => (
          <rect
            key={`${x},${y}`}
            x={x + 0.08}
            y={y + 0.08}
            width={0.84}
            height={0.84}
            fill={color}
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * ONE CARD. The turret's sprite on its rarity's own solid ground, that
 * colour's border round it, the slot's key in one corner and the
 * formation's diagram in the other, the name under it, and a hairline of
 * clock along the bottom edge.
 *
 * THE BORDER IS THE WHOLE POINT of the rarity system on this screen: a
 * player mid-wave has no time to read a word, and the difference between
 * grey and purple lands before the eye reaches the sprite. The name is
 * there for the second glance and the hover card for the third.
 */
function TurretCard({
  card,
  slot,
  icon,
  held,
  onPick,
}: {
  card: DealCard;
  /** where it is standing in the hand, 0-based — its key is this */
  slot: number;
  icon: string;
  held: boolean;
  onPick: () => void;
}) {
  const tip = useHoverCard("up");
  const r = rarityDef(card.kind);
  const stats = TOWERS[card.kind];
  const f = formationDef(card.form);
  const n = f.cells.length;
  const key = slotLabel(slot);
  const blinking = !held && card.left <= CARD_BLINK;
  return (
    <button
      ref={tip.ref as RefObject<HTMLButtonElement | null>}
      {...tip.anchorProps}
      onClick={onPick}
      aria-label={`Slot ${key}: ${n} ${stats.name}, ${r.name}, ${f.name} formation${
        held ? ", in hand" : ""
      }`}
      aria-keyshortcuts={key}
      aria-pressed={held}
      className={`ms-deal-card relative flex h-[4.8rem] w-[3.6rem] shrink-0 flex-col items-center justify-center gap-0.5 border-2 p-0 ${
        blinking ? "ms-deal-blink" : ""
      } ${held ? "ms-deal-held" : ""}`}
      style={{ borderColor: r.color, background: r.ground, color: r.color }}
    >
      {/* THE SLOT'S KEY, on its own dark ground in the corner: the sprite
          fills most of the square and a bare digit over it is unreadable.
          It is the POSITION's number and not the card's, so it changes
          under a card when the one before it is placed — which is exactly
          what makes a hand empty out under one repeated finger */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 bg-[#0b0b0d]/85 px-[3px] py-[1px] text-[11px] font-bold leading-none"
      >
        {key}
      </span>
      <FormationMark form={card.form} color={r.color} />
      {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
      <img src={icon} alt="" className="mt-1 h-8 w-8 [image-rendering:pixelated]" />
      <span className="max-w-full truncate px-0.5 text-[9px] font-bold uppercase leading-none tracking-wide">
        {n}× {stats.name}
      </span>
      {/* THE CLOCK, along the foot of the card: a bar rather than a number,
          because what a player needs off it is "how much of that is left"
          and never "how many seconds". It is full and still on a card in
          hand, which is the freeze made visible */}
      <span aria-hidden="true" className="absolute bottom-0 left-0 h-[3px] w-full bg-black/45">
        <span
          className="block h-full"
          style={{
            width: `${Math.max(0, Math.min(1, card.left / CARD_LIFE)) * 100}%`,
            background: r.color,
          }}
        />
      </span>
      <HoverCard tip={tip} title={`${n}× ${stats.name}`} tag={r.name} color={r.color} align="right">
        {TOWER_DESC[card.kind]}
        <span className="mt-1.5 block font-bold text-[#A6A6AF]">
          {f.name} — {n} turrets, {f.w * stats.size}×{f.h * stats.size} tiles
        </span>
        <span className="mt-1.5 block text-[#EDEDEF]">
          {held ? "In hand — click the board to place it." : `Click, or press ${key}, to pick it up.`}
        </span>
      </HoverCard>
    </button>
  );
}

/** the two buttons, and the hand standing over them */
export function DealCorner({
  hud,
  icons,
  cards,
  picked,
  full,
  onBuy,
  onPick,
}: {
  hud: UiState;
  icons: Partial<Record<TowerKind, string>>;
  cards: readonly DealCard[];
  picked: number | null;
  full: boolean;
  onBuy: () => void;
  onPick: (id: number) => void;
}) {
  const poor = hud.scrap !== null && hud.scrap < hud.rollPrice;
  return (
    <div className="flex flex-col items-end gap-2">
      {/* THE HAND READS LEFT TO RIGHT: slot 1 on the LEFT, 2 beside it, on
          to 0 — the order the digits are printed on the keyboard and the
          order every list a person has ever read runs in. It was laid out
          right-to-left first, so that the newest card landed nearest the
          button that threw it, and that was the wrong thing to optimise:
          the hand is READ far more often than it is added to, and a row
          that counts backwards has to be decoded every single time.

          `flex-wrap-reverse` is what keeps it growing UPWARD off the
          buttons — the first line stays on the floor of the corner and an
          eleventh card would stack above it, rather than the row sliding
          down over the field. */}
      {cards.length > 0 && (
        <div
          role="list"
          aria-label="turret cards"
          className="pointer-events-auto flex max-w-[26rem] flex-wrap-reverse justify-end gap-1.5"
        >
          {cards.map((c, i) => (
            <TurretCard
              key={c.id}
              card={c}
              slot={i}
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
            poor || full ? "opacity-60" : ""
          }`}
          onClick={onBuy}
          aria-keyshortcuts="T"
          aria-label={
            full
              ? "Buy turret — hand full"
              : `Buy turret for ${hud.rollPrice} scrap, shortcut T`
          }
        >
          <span>
            <span className="text-[#A6A6AF]">T</span> Buy turret
          </span>
          {/* A FULL HAND SAYS SO where the price goes: the button is the
              only thing on screen that can explain why pressing it did
              nothing, and "you have ten cards out" is the explanation */}
          {full ? (
            <span className="text-[11px] tracking-normal text-[#FF8A8A]">Full</span>
          ) : (
            hud.scrap !== null && (
              <span className={poor ? "text-[#FF8A8A]" : "text-white"}>{hud.rollPrice}</span>
            )
          )}
        </button>
        {/* not built yet, and on screen anyway — see the header */}
        <button
          className="ms-btn h-9 w-full cursor-not-allowed justify-between px-2 text-[13px] font-bold uppercase tracking-wide opacity-45"
          disabled
          aria-keyshortcuts="G"
          aria-label="Buy upgrade — not available yet"
        >
          <span>
            <span className="text-[#A6A6AF]">G</span> Buy upgrade
          </span>
          <span className="text-[11px] tracking-normal text-[#A6A6AF]">Soon</span>
        </button>
      </div>
    </div>
  );
}
