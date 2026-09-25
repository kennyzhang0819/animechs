"use client";

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";

import { TOWER_DESC, TOWERS } from "@/game/constants";
import { factionOf } from "@/game/types";
import { TOWER_TIER, TOWER_TIERS, type BuyAmount, type TowerTier } from "@/game/economy";
import {
  fleetFootprint,
  formationCount,
  formationDef,
  formationSpan,
  type Facing,
  type FormationId,
} from "@/game/formation";
import type { Game, UiState } from "@/game/game";
import { RARITY, rarityDef, rarityForTier } from "@/game/rarity";
import type { TowerKind } from "@/game/types";
import { TOWER_ICONS } from "./towerIcons";
import { HoverCard, useHoverCard } from "./HoverCard";
import { tile } from "./tile";

/**
 * THE DEAL — the roguelike door a charged run buys through, and
 * everything the field's bottom-right corner is while one is being played.
 *
 * THE CORNER IS A SQUARE, and it is the minimap's square. FOUR TIER
 * BUTTONS in a 2x2 with the SHAPE button under them:
 *
 *   1 / 2 / 3 / 4 BUY A CARD OF THAT TIER. The tier is the turret's
 *   footprint in tiles (economy.ts TOWER_TIER) and the price under the
 *   button is exact before the press. WHAT IS ROLLED is which gun of the
 *   band comes up and HOW BIG A PATCH of it lands — 3x3 up to 6x6
 *   (formation.ts) — so the same scrap sometimes buys nine turrets and
 *   sometimes thirty-six. The card drops into the corner already aimed.
 *
 *   THE BANDS OPEN ON THE RUN CLOCK (economy.ts TIER_UNLOCK): tier 1 from
 *   the first frame, then one every five minutes. A shut button wears a
 *   grey sweep that retreats clockwise as its minute comes round, and NO
 *   NUMBER: the shade says "not yet" and how far off it is, which is what
 *   a player glances at mid-wave — a countdown would be a clock to watch.
 *
 *   AMOUNT (X) cycles 1 -> 4 -> 9 -> 16 and is a standing setting, not a
 *   held modifier. It multiplies all four prices, flat, with no bulk
 *   discount, and what it buys is the rolled shape TILED that many times
 *   — one gun, one roll, that much more ground.
 *
 * THE MODULE BUTTONS ARE GONE. Mods and relics are out of the run
 * (track.ts, economy.ts) — the corner buys guns and ground and nothing
 * else.
 *
 * AND R TURNS THE CARD IN HAND a quarter clockwise, which is the one
 * thing here that is not a button in the square: it is a verb on the
 * GHOST, aimed with the cursor.
 *
 * THE FLOW IS 1, CLICK, 1, CLICK. There is no hand to manage: a card is
 * drawn already aimed and stands until the ground takes it. A re-roll is
 * not refunded — it costs another card, which is what keeps the band's
 * spread a real spread and not a free look.
 *
 * OWNING A CARD AND AIMING IT ARE TWO DIFFERENT STATES. The right button
 * puts the GHOST away and leaves the card in its slot; clicking the slot
 * picks it back up. Nothing about that gesture spends anything. THE PRESS
 * IS WHAT SPENDS: the price leaves the purse when the card is drawn, so a
 * card in the slot is money already gone and drawing over it loses that
 * money.
 */

/** one card, derived WHOLE from the run state — the deal keeps no state
 *  of its own, because the card IS what the run owns (Game.heldCard) */
export interface DealCard {
  kind: TowerKind;
  form: FormationId;
  /** how many copies of the shape it carries — the amount it was bought at */
  n: number;
}

/** what the corner is holding right now, or null for an empty slot */
export const cardOf = (hud: UiState | null): DealCard | null => hud?.held ?? null;

/**
 * THE DEAL'S ACTIONS, and its keyboard.
 *
 * There is no state machine here. The Game owns the card (Game.heldCard),
 * owns whether it is being aimed and owns the standing shape, so every one
 * of these is a single call and everything on screen is read straight off
 * the HUD poll.
 */
export interface DealActions {
  buy: (tier: TowerTier) => void;
  cycleShape: () => void;
  rotate: () => void;
  toggle: () => void;
}

export function useDeal(
  gameRef: RefObject<Game | null>,
  hud: UiState | null,
  refresh: () => void,
): DealActions {
  const dealing = hud?.dealing ?? false;
  const over = !hud || hud.lost || hud.won;

  const buy = useCallback(
    (tier: TowerTier) => {
      const g = gameRef.current;
      if (!g) return;
      // it overwrites what is in hand by itself — that is the re-roll
      g.buyTurretCard(tier);
      refresh();
    },
    [gameRef, refresh],
  );

  /** the amount button, and the only one that spends nothing */
  const cycleShape = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.cycleBuyAmount();
    refresh();
  }, [gameRef, refresh]);

  /** R: turn the ghost a quarter clockwise. It spends nothing either, and
   *  it does nothing at all unless a card is being aimed */
  const rotate = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (g.rotateHeld()) refresh();
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
   * 1, 2, 3, 4 AND X — one key a button, in the order the square reads —
   * and R on top of them, which turns the ghost rather than pressing
   * anything. T re-buys at the tier of whatever is in hand, which is the
   * re-roll without having to remember which number was last pressed.
   *
   * It declines the same presses the buttons would: a modifier held, a
   * text field focused, the run over or the pause menu up. And it is off
   * entirely on a free board, where the letters are the command card's own
   * (tech.ts).
   */
  const held = hud?.held?.kind ?? null;
  useEffect(() => {
    if (!dealing || over) return;
    const by: Record<string, () => void> = {
      Digit1: () => buy(1),
      Digit2: () => buy(2),
      Digit3: () => buy(3),
      Digit4: () => buy(4),
      KeyT: () => buy(held ? TOWER_TIER[held] : 1),
      KeyX: cycleShape,
      KeyR: rotate,
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, [contenteditable]")
      )
        return;
      const act = by[e.code];
      if (!act) return;
      const g = gameRef.current;
      if (!g || g.ui().menuOpen) return;
      e.preventDefault();
      act();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealing, over, buy, cycleShape, rotate, held, gameRef]);

  return { buy, cycleShape, rotate, toggle };
}

/**
 * THE SHAPE, AS A PICTURE (formation.ts): the shape's own grid, a filled
 * square per turret in it, TURNED the way R has turned it. The diagram is
 * read off fleetFootprint, the same call the ghost makes, so pressing R
 * turns the picture in the corner and the shape on the ground in the same
 * frame. A picture and not a word, because the count is the whole fact.
 */
function FormationMark({
  form,
  n,
  facing,
  color,
}: {
  form: FormationId;
  n: number;
  facing: Facing;
  color: string;
}) {
  // the same footprint the ghost is drawing, turns and all — the diagram
  // on the card and the shape on the ground are one function (formation.ts)
  const { cells, w, h } = fleetFootprint(form, n, facing);
  const span = Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      className="ms-tile ms-tile-sm pointer-events-none absolute right-[3px] top-[3px] flex h-[18px] w-[18px] items-center justify-center"
      style={tile(color)}
    >
      <svg viewBox={`0 0 ${span} ${span}`} className="h-[13px] w-[13px]">
        {/* centred in a square viewBox, so a block and a citadel are drawn
            at the same scale and the difference between them IS the picture */}
        <g transform={`translate(${(span - w) / 2} ${(span - h) / 2})`}>
          {cells.map(([x, y]) => (
            <rect key={`${x},${y}`} x={x + 0.08} y={y + 0.08} width={0.84} height={0.84} fill={color} />
          ))}
        </g>
      </svg>
    </span>
  );
}

/**
 * THE CARD IN HAND. The turret's sprite on its TIER's own solid ground,
 * that colour's border round it, the shape's diagram in the corner, and
 * what it will put down written underneath.
 *
 * THE BORDER IS THE TIER, which is the price and the footprint at once: a
 * player mid-wave has no time to read a word, and the difference between
 * grey and purple lands before the eye reaches the sprite.
 *
 * THE NUMBER UNDER THE SPRITE IS THE WHOLE CARD and the line under it is
 * the shape, because the patch a player has to find ground for is the
 * thing they are about to have to solve.
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
  facing,
  onToggle,
}: {
  card: DealCard;
  icon: string;
  /** is the ghost on the board right now? */
  aimed: boolean;
  /** the quarter turns R has put on it */
  facing: Facing;
  onToggle: () => void;
}) {
  const tip = useHoverCard("up");
  const r = rarityDef(card.kind);
  const stats = TOWERS[card.kind];
  const name = stats.name;
  const f = formationDef(card.form);
  const n = formationCount(card.form, card.n);
  const shape = `${f.w}×${f.h} ${f.name}`;
  const [sw, sh] = formationSpan(stats.size, card.form, card.n, facing);
  return (
    <button
      ref={tip.ref as RefObject<HTMLButtonElement | null>}
      {...tip.anchorProps}
      onClick={onToggle}
      aria-pressed={aimed}
      aria-label={`${n} ${name}, tier ${TOWER_TIER[card.kind]}, in a ${shape}. ${
        aimed
          ? `Aimed, turned ${facing * 90} degrees — R turns it, click the board to place it.`
          : "Click to pick it up."
      }`}
      className={`ms-deal-card ms-tile pointer-events-auto flex h-[5rem] w-[4.5rem] cursor-pointer flex-col items-center justify-center gap-0.5 p-0 ${
        aimed ? "" : "ms-deal-down"
      }`}
      style={tile(r.color)}
    >
      <FormationMark form={card.form} n={card.n} facing={facing} color={r.color} />
      {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
      <img src={icon} alt="" className="mt-1.5 h-8 w-8 [image-rendering:pixelated]" />
      <span className="max-w-full px-0.5 text-center font-display text-[8px] font-bold uppercase leading-[1.15]">
        {n}× {name}
      </span>
      <span className="max-w-full truncate px-0.5 font-display text-[7px] font-bold uppercase leading-none opacity-70">
        {shape}
      </span>
      <HoverCard tip={tip} title={`${n}× ${name}`} tag={`Tier ${TOWER_TIER[card.kind]} · ${factionOf(card.kind).name}`} color={r.color} align="right">
        {TOWER_DESC[card.kind]}
        <span className="mt-1.5 block font-bold" style={{ color: r.color }}>
          {shape} — {n} turrets, {sw}×{sh} tiles
        </span>
        <span className="mt-1.5 block text-[#EDEDEF]">
          {aimed
            ? "R turns it a quarter. Click the board to place it, right click puts it back here."
            : "Click to pick it up again."}
        </span>
      </HoverCard>
    </button>
  );
}

/**
 * THE SQUARE, and the one card standing over it.
 *
 * FOUR TIER BUTTONS IN A 2x2 with the amount button under them, in a pane
 * the size of the minimap's — the two bottom corners are a matched pair.
 * Each button is a big square target rather than a strip of text, which is
 * what a control pressed a hundred times a run, mid-wave, without looking,
 * has to be.
 *
 * READING ORDER IS THE ORDER OF THE PRICE: tier 1 through tier 4, cheapest
 * first, wearing their own four colours. The AMOUNT comes last and spans
 * the width, because it is the multiplier on the other four rather than a
 * fifth thing to buy — the quantity field goes after the item.
 */
function TierButton({
  tier,
  price,
  poor,
  owned,
  gate,
  free,
  onPress,
}: {
  tier: TowerTier;
  price: number;
  poor: boolean;
  /** has the track dealt this save anything in the band at all? */
  owned: boolean;
  /** the run clock's own gate: seconds left, and how long the wait was
   *  (game.ts UiState.tierGates) */
  gate: { left: number; of: number };
  free: boolean;
  onPress: () => void;
}) {
  const r = RARITY[rarityForTier(tier)];
  const shut = gate.left > 0;
  const disabled = !owned || shut;
  // the grey retreats CLOCKWISE as the wait runs down: the covered wedge
  // is what is left of it, measured from twelve o'clock
  const swept = gate.of > 0 ? Math.max(0, Math.min(1, gate.left / gate.of)) : 0;
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-keyshortcuts={String(tier)}
      aria-label={
        !owned
          ? `Tier ${tier} — the track has dealt this save none`
          : shut
            ? `Tier ${tier} is not open yet`
            : `Buy a tier ${tier} card for ${price} scrap, shortcut ${tier}`
      }
      className={`ms-btn ms-btn-key ms-btn-tint relative flex h-full w-full flex-col items-center justify-center gap-1 overflow-hidden px-1 py-1 ${
        !disabled && poor ? "opacity-60" : ""
      }`}
      style={{ ["--ms-tint" as string]: r.color }}
    >
      <span className="ms-key">{tier}</span>
      {/* the glyph IS the footprint: a tier-n turret is n tiles square */}
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
        <rect
          x={12 - 2.5 * tier}
          y={12 - 2.5 * tier}
          width={5 * tier}
          height={5 * tier}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <span className="max-w-full truncate font-display text-[10px] font-bold uppercase leading-none text-[#E8E4D8]">
        {tier}×{tier} gun
      </span>
      {!free && (
        <span
          className={`font-display text-[12px] font-bold leading-none tabular-nums ${
            poor ? "text-[#FF8A8A]" : "text-white"
          }`}
        >
          {price.toLocaleString()}
        </span>
      )}
      {/* THE SHADE AND NO NUMBER. It retreats clockwise as the wait runs
          down, and that is all it says: a countdown on the button would
          turn the opening into a thing a player waits out with a timer
          rather than a band that arrives while they are playing */}
      {shut && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `conic-gradient(from 0deg, transparent 0turn ${1 - swept}turn, rgba(8,9,12,0.8) ${1 - swept}turn 1turn)`,
          }}
        />
      )}
    </button>
  );
}

export function DealCorner({
  hud,
  icons,
  deal,
}: {
  hud: UiState;
  icons: Partial<Record<TowerKind, string>>;
  deal: DealActions;
}) {
  const card = cardOf(hud);
  const amount: BuyAmount = hud.amount;
  const free = hud.scrap === null;
  const short = (cost: number): boolean => hud.scrap !== null && hud.scrap < cost;
  const owns = (t: TowerTier): boolean =>
    hud.unlocked === null || hud.unlocked.some((k) => TOWER_TIER[k] === t);
  return (
    <div className="flex flex-col items-end gap-2">
      {card && (
        <TurretCard
          card={card}
          icon={icons[card.kind] ?? TOWER_ICONS[card.kind]}
          aimed={hud.buildKind !== null}
          facing={hud.buildFacing}
          onToggle={deal.toggle}
        />
      )}
      <div className="ms-pane pointer-events-auto p-1">
        <div
          role="group"
          aria-label="deal"
          className="grid h-[13rem] w-[13rem] grid-cols-2 grid-rows-[1fr_1fr_3rem] gap-1"
        >
          {TOWER_TIERS.map((t) => (
            <TierButton
              key={t}
              tier={t}
              price={hud.tierPrices[t]}
              poor={short(hud.tierPrices[t])}
              owned={owns(t)}
              gate={hud.tierGates[t]}
              free={free}
              onPress={() => deal.buy(t)}
            />
          ))}
          <button
            onClick={deal.cycleShape}
            aria-keyshortcuts="X"
            aria-label={`Amount: ${amount} ${amount === 1 ? "copy" : "copies"} of whatever shape the press rolls. Click to cycle, shortcut X`}
            className="ms-btn ms-btn-key col-span-2 relative flex h-full w-full flex-row items-center justify-center gap-2 px-1 py-1"
          >
            <span className="ms-key">X</span>
            <span className="font-display text-[22px] font-bold leading-none tabular-nums">
              ×{amount}
            </span>
            <span className="font-display text-[10px] font-bold uppercase leading-none text-[#8A8E98]">
              {amount === 1 ? "one patch" : `${amount} patches`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
