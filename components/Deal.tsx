"use client";

import { useCallback, useEffect, type RefObject } from "react";

import { TOWER_DESC, TOWERS } from "@/game/constants";
import { formationDef, formationRarity, type FormationId } from "@/game/formation";
import type { Game, UiState } from "@/game/game";
import { RARITY, rarityDef } from "@/game/rarity";
import type { TowerKind } from "@/game/types";
import { TOWER_ICONS } from "./towerIcons";
import { HoverCard, useHoverCard } from "./HoverCard";

/**
 * THE DEAL — the roguelike door a charged run buys turrets through, and
 * everything the field's bottom-right corner is while one is being played.
 *
 * The command card (tech.ts BUILD_SLOTS) is gone from a real run. In its
 * place: two buttons, and ONE card at a time.
 *
 *   BUY TURRET (T) pays a flat fee (economy.ts TURRET_ROLL_PRICE), rolls
 *   two tables — which turret (rarity.ts) and what shape of it
 *   (formation.ts) — and drops the result into the corner's one slot,
 *   already aimed. The ghost is on the board before the finger has left
 *   the key.
 *
 *   BUY UPGRADE (G) is the second half of the same idea and is not built
 *   yet. It is on screen, dark, saying so — because the corner's LAYOUT
 *   is a promise about what a run is, and a button that appears later
 *   moves everything the hand has already learned.
 *
 * THE FLOW IS T, CLICK, T, CLICK. There is no hand to manage, no slot to
 * choose and no clock to beat: a card is drawn already aimed, and it
 * stands until the ground takes it. A player who wants a bastion and drew
 * a quad presses T until they get one, at a thousand scrap a look — THE
 * SPAM IS THE MECHANIC, and a re-roll is not refunded, because a free one
 * would make the shape roll decorative.
 *
 * OWNING A CARD AND AIMING IT ARE TWO DIFFERENT STATES. The right button
 * puts the GHOST away and leaves the card in its slot; clicking the slot
 * picks it back up. Nothing about that gesture spends anything — it is
 * the same "put that down" every player in this game already reaches for,
 * and it used to burn a thousand scrap, which made the safest reflex on
 * the mouse the most expensive one. THE ONLY TWO THINGS THAT SPEND A CARD
 * ARE PLACING IT AND BUYING ANOTHER.
 */

/** one card, derived WHOLE from the run state — the deal keeps no state
 *  of its own, because the card IS what the run owns (Game.heldCard) */
export interface DealCard {
  kind: TowerKind;
  form: FormationId;
}

/** what the corner is holding right now, or null for an empty slot */
export const cardOf = (hud: UiState | null): DealCard | null => hud?.held ?? null;

/**
 * THE DEAL'S TWO ACTIONS, and its keyboard.
 *
 * There is no state machine left here. The Game owns the card
 * (Game.heldCard) and owns whether it is being aimed, so buying is one
 * call, picking it up is one call, and the card on screen is read
 * straight off the HUD poll.
 */
export function useDeal(
  gameRef: RefObject<Game | null>,
  hud: UiState | null,
  refresh: () => void,
): { buy: () => void; toggle: () => void } {
  const dealing = hud?.dealing ?? false;
  const over = !hud || hud.lost || hud.won;

  const buy = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    // it overwrites what is in hand by itself — that is the re-roll
    g.buyTurretCard();
    refresh();
  }, [gameRef, refresh]);

  /** pick the owned card back up, or put the ghost down — it spends
   *  nothing either way */
  const toggle = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.toggleHeldCard();
    refresh();
  }, [gameRef, refresh]);

  /**
   * T DEALS, G IS THE UPGRADE BUTTON for the day it works. Two keys, and
   * the flow is one of them: T, click, T, click.
   *
   * It declines the same presses the buttons would: a modifier held (ctrl
   * and cmd belong to the browser and the system), a text field focused,
   * the run over or the pause menu up. And it is off entirely on a free
   * board, where T and G are two of the command card's own letters
   * (tech.ts) and mean a turret each.
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
      if (e.code !== "KeyT" && e.code !== "KeyG") return;
      const g = gameRef.current;
      if (!g || g.ui().menuOpen) return;
      e.preventDefault();
      // G is swallowed anyway so the key is DEAD rather than wrong the day
      // it starts working — a player who learns it now learns it once
      if (e.code === "KeyT") buy();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealing, over, buy, gameRef]);

  return { buy, toggle };
}

/**
 * THE FORMATION, AS A PICTURE (formation.ts): the shape's own grid, a
 * filled square per turret in it, framed in ITS OWN rarity's colour.
 *
 * Two rarities on one card, in one palette. The border round the whole
 * card is the TURRET's band and the little frame in the corner is the
 * SHAPE's, so "nine duos" and "thirty-six duos" are told apart at a
 * glance without either number being read — and a grey card with a purple
 * corner is exactly as legible as it should be, which is "the gun is
 * nothing special and there are an awful lot of it".
 *
 * It is a diagram and not a word because the names are names a player has
 * to have learned; a picture of thirteen squares in a star is not. The
 * hover card carries the name and the count for the second look.
 */
function FormationMark({ form }: { form: FormationId }) {
  const f = formationDef(form);
  const color = RARITY[formationRarity(form)].color;
  const n = Math.max(f.w, f.h);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-[2px] top-[2px] flex h-[17px] w-[17px] items-center justify-center border bg-[#0b0b0d]"
      style={{ borderColor: color }}
    >
      <svg viewBox={`0 0 ${n} ${n}`} className="h-[13px] w-[13px]">
        {/* centred in a square viewBox, so a quad and a citadel are drawn
            at the same scale and the difference between them IS the picture */}
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
    </span>
  );
}

/**
 * THE CARD IN HAND. The turret's sprite on its rarity's own solid ground,
 * that colour's border round it, the shape's diagram in the corner in the
 * shape's own colour, and what it will put down written underneath.
 *
 * THE BORDER IS THE WHOLE POINT of the rarity system on this screen: a
 * player mid-wave has no time to read a word, and the difference between
 * grey and purple lands before the eye reaches the sprite.
 *
 * IT IS A BUTTON, and the click is a toggle: a card whose ghost has been
 * put away with the right button is picked back up here, and a card being
 * aimed is put down again. It is the command card's own gesture, kept
 * where the command card used to be.
 */
function TurretCard({
  card,
  icon,
  aimed,
  onToggle,
}: {
  card: DealCard;
  icon: string;
  /** is the ghost on the board right now? */
  aimed: boolean;
  onToggle: () => void;
}) {
  const tip = useHoverCard("up");
  const r = rarityDef(card.kind);
  const stats = TOWERS[card.kind];
  const f = formationDef(card.form);
  const fr = RARITY[formationRarity(card.form)];
  const n = f.cells.length;
  return (
    <button
      ref={tip.ref as RefObject<HTMLButtonElement | null>}
      {...tip.anchorProps}
      onClick={onToggle}
      aria-pressed={aimed}
      aria-label={`${n} ${stats.name}, ${r.name}, in a ${f.name}, ${fr.name} shape. ${
        aimed ? "Aimed — click the board to place it." : "Click to pick it up."
      }`}
      className={`ms-deal-card pointer-events-auto relative flex h-[5rem] w-[3.8rem] cursor-pointer flex-col items-center justify-center gap-0.5 border-2 p-0 ${
        aimed ? "" : "ms-deal-down"
      }`}
      style={{ borderColor: r.color, background: r.ground, color: r.color }}
    >
      <FormationMark form={card.form} />
      {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
      <img src={icon} alt="" className="mt-1.5 h-8 w-8 [image-rendering:pixelated]" />
      <span className="max-w-full truncate px-0.5 text-[10px] font-bold uppercase leading-none tracking-wide">
        {n}× {stats.name}
      </span>
      <span className="text-[8px] font-bold uppercase leading-none tracking-wide opacity-70">
        {f.name}
      </span>
      <HoverCard tip={tip} title={`${n}× ${stats.name}`} tag={r.name} color={r.color} align="right">
        {TOWER_DESC[card.kind]}
        <span className="mt-1.5 block font-bold" style={{ color: fr.color }}>
          {f.name} — {n} turrets, {f.w * stats.size}×{f.h * stats.size} tiles, {fr.name} shape
        </span>
        <span className="mt-1.5 block text-[#EDEDEF]">
          {aimed
            ? "Click the board to place it. Right click puts it back here."
            : "Click to pick it up again."}
        </span>
      </HoverCard>
    </button>
  );
}

/** the two buttons, and the one card standing over them */
export function DealCorner({
  hud,
  icons,
  onBuy,
  onToggle,
}: {
  hud: UiState;
  icons: Partial<Record<TowerKind, string>>;
  onBuy: () => void;
  onToggle: () => void;
}) {
  const poor = hud.scrap !== null && hud.scrap < hud.rollPrice;
  const card = cardOf(hud);
  return (
    <div className="flex flex-col items-end gap-2">
      {card && (
        <TurretCard
          card={card}
          icon={icons[card.kind] ?? TOWER_ICONS[card.kind]}
          aimed={hud.buildKind !== null}
          onToggle={onToggle}
        />
      )}
      <div className="ms-pane pointer-events-auto flex w-[13rem] flex-col gap-1 p-1">
        <button
          className={`ms-btn h-9 w-full justify-between px-2 text-[13px] font-bold uppercase tracking-wide ${
            poor ? "opacity-60" : ""
          }`}
          onClick={onBuy}
          aria-keyshortcuts="T"
          aria-label={`Buy turret for ${hud.rollPrice} scrap, shortcut T`}
        >
          <span>
            <span className="text-[#A6A6AF]">T</span> {card ? "Re-roll" : "Buy turret"}
          </span>
          {hud.scrap !== null && (
            <span className={poor ? "text-[#FF8A8A]" : "text-white"}>{hud.rollPrice}</span>
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
