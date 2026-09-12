"use client";

import { useCallback, useEffect, useState, type ReactNode, type RefObject } from "react";

import { TOWER_DESC, TOWERS } from "@/game/constants";
import {
  fleetFootprint,
  formationCount,
  formationDef,
  formationRarity,
  formationSpan,
  type Facing,
  type FormationId,
} from "@/game/formation";
import type { DealHalf, Game, UiState } from "@/game/game";
import { RARITY, rarityDef } from "@/game/rarity";
import type { ModId } from "@/game/mods";
import type { TowerKind } from "@/game/types";
import { TOWER_ICONS } from "./towerIcons";
import { Glyph, ModReveal } from "./Relics";
import { HoverCard, useHoverCard } from "./HoverCard";

/** what a shut half of the catalog says under its label (game.ts DealHalf) */
const HALF_SUB: Record<Exclude<DealHalf, "open">, string> = {
  owned: "all owned",
  locked: "locked",
};

/**
 * THE DEAL — the roguelike door a charged run buys through, and
 * everything the field's bottom-right corner is while one is being played.
 *
 * THE CORNER IS A SQUARE, and it is the minimap's square. The two bottom
 * corners of the field are the two halves of a StarCraft HUD — where you
 * are on the left, what you can do on the right — and they now read as a
 * matched pair rather than as a map and whatever height a stack of
 * buttons happened to come to. FOUR BUTTONS, in a 2x2 inside it:
 *
 *   BUY TURRET (T) pays a flat fee (economy.ts TURRET_ROLL_PRICE), rolls
 *   two tables — which turret (rarity.ts) and what shape of it
 *   (formation.ts) — and drops the result into the corner's one slot,
 *   already aimed. The ghost is on the board before the finger has left
 *   the key.
 *
 *   BUY MODS (M) and BUY RELICS (G) are the two halves of the module
 *   catalog (mods.ts), and they are TWO BUTTONS because they are two
 *   purchases. A MOD is a turret attribute: it improves nothing standing,
 *   and adds a chance to every turret placed from here on. A RELIC is
 *   global: it is in force over the whole board the moment it is paid
 *   for. They cost differently (economy.ts MOD_ROLL_PRICE,
 *   RELIC_ROLL_PRICE) and they answer different questions — "is the rest
 *   of this run going to be worth it" against "is this wave" — and one
 *   button that flipped a coin between them let the player aim at
 *   neither.
 *
 *   AMOUNT (X) cycles 1 -> 4 -> 9 and multiplies whichever of the other
 *   three is pressed next. It spends nothing and it is a standing
 *   setting, not a held modifier.
 *
 * AND R TURNS THE CARD IN HAND a quarter clockwise, which is the one
 * thing here that is not a button in the square: it is a verb on the
 * GHOST, aimed with the cursor, and it belongs under the hand rather than
 * in a panel the hand would have to leave the board to reach. R is the
 * rotate key every builder in the genre uses, so the relics moved to G —
 * which is the key the merged upgrade button used to own, and therefore
 * the key an older run's fingers already go to for a module.
 *
 * WHAT THE AMOUNT DOES IS DIFFERENT ON THE TWO SIDES, and that is the
 * whole design. On the modules it is N draws: nine relics is nine relics.
 * On the TURRET it is not nine cards — it is ONE card whose shape is
 * TILED nine times (formation.ts fleetLayout), so a x9 press still rolls
 * one gun and one shape and what it multiplies is the GROUND being asked
 * for. THE AMOUNTS ARE SQUARES (economy.ts) so the tiling is square and
 * the copies butt with no gap: nine citadels of spectres is one solid
 * decision about one piece of map the size of a town, and the ghost of it
 * going down over the terrain is most of what the button is for.
 *
 *   BECAUSE A MODULE HAS NOWHERE TO LAND, THE DRAW GETS A REVEAL: a card
 *   over the buttons for a few seconds saying what was bought, and then
 *   gone. It is the only feedback the purchase has at the moment it is
 *   made, and a x10 press gets ONE card listing its ten.
 *
 * THE FLOW IS T, CLICK, T, CLICK. There is no hand to manage, no slot to
 * choose and no clock to beat: a card is drawn already aimed, and it
 * stands until the ground takes it. A player who wants a bastion and drew
 * a quad presses T until they get one, at a thousand scrap a look — THE
 * SPAM IS THE MECHANIC, and a re-roll is not refunded, because a free one
 * would make the shape roll decorative. The amount button does not touch
 * that: it is a flat multiplier on the price with no bulk discount
 * anywhere, so it buys keystrokes and never value.
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
  /** how many copies of the shape it carries — the amount it was bought at */
  n: number;
}

/** what the corner is holding right now, or null for an empty slot */
export const cardOf = (hud: UiState | null): DealCard | null => hud?.held ?? null;

/**
 * THE DEAL'S FOUR ACTIONS, and its keyboard.
 *
 * There is no state machine left here. The Game owns the card
 * (Game.heldCard), owns whether it is being aimed and owns the amount, so
 * every one of these is a single call and everything on screen is read
 * straight off the HUD poll.
 */
export interface DealActions {
  buy: () => void;
  buyMods: () => void;
  buyRelics: () => void;
  cycleAmount: () => void;
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

  const buy = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    // it overwrites what is in hand by itself — that is the re-roll
    g.buyTurretCard();
    refresh();
  }, [gameRef, refresh]);

  /** THE MODULES, AND THEY ARE ALREADY APPLIED — there is nothing to pick
   *  up and nothing to re-roll (see the header) */
  const buyMods = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.buyMods();
    refresh();
  }, [gameRef, refresh]);

  const buyRelics = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.buyRelics();
    refresh();
  }, [gameRef, refresh]);

  /** the fourth button, and the only one that spends nothing */
  const cycleAmount = useCallback(() => {
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
   * T, M, G, X — one key a button, in the order the square reads — and R
   * on top of them, which turns the ghost rather than pressing anything.
   * The flow of a run is the first of them: T, R until the fleet lies the
   * way the ground wants it, click; and M or G whenever the bank can
   * stand it.
   *
   * It declines the same presses the buttons would: a modifier held (ctrl
   * and cmd belong to the browser and the system), a text field focused,
   * the run over or the pause menu up. And it is off entirely on a free
   * board, where these are the command card's own letters (tech.ts) and
   * mean a turret each.
   */
  useEffect(() => {
    if (!dealing || over) return;
    const by: Record<string, () => void> = {
      KeyT: buy,
      KeyM: buyMods,
      KeyG: buyRelics,
      KeyX: cycleAmount,
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
  }, [dealing, over, buy, buyMods, buyRelics, cycleAmount, rotate, gameRef]);

  return { buy, buyMods, buyRelics, cycleAmount, rotate, toggle };
}

/** how long the reveal stands before it goes (seconds x 1000) */
const REVEAL_MS = 5000;

/**
 * WHAT THE LAST MODULE PRESS BOUGHT, while it is still worth saying.
 *
 * It watches `modDraws`, not the ids: the counter moves on EVERY press
 * and the ids need not, so drawing a third Calibration Matrix re-opens
 * the reveal instead of silently leaving the second one's card standing.
 */
function useReveal(hud: UiState | null): readonly ModId[] {
  const draws = hud?.modDraws ?? 0;
  const ids = hud?.lastMods;
  const [shownAt, setShownAt] = useState(0);
  const [gone, setGone] = useState(true);
  useEffect(() => {
    if (draws === 0) return;
    setShownAt(draws);
    setGone(false);
    const t = window.setTimeout(() => setGone(true), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [draws]);
  return !gone && shownAt === draws && ids ? ids : EMPTY;
}

const EMPTY: readonly ModId[] = [];

/**
 * THE FORMATION, AS A PICTURE (formation.ts): the shape's own grid, a
 * filled square per turret in it, framed in ITS OWN rarity's colour —
 * and at x5 or x10, the WHOLE FLEET, tiled exactly the way the ground
 * will take it, gutters and all, and TURNED the way R has turned it. The
 * diagram is read off fleetFootprint, which is the same call the ghost
 * makes, so pressing R turns the picture in the corner and the shape on
 * the ground in the same frame.
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
function FormationMark({ form, n, facing }: { form: FormationId; n: number; facing: Facing }) {
  const color = RARITY[formationRarity(form)].color;
  // the same footprint the ghost is drawing, turns and all — the diagram
  // on the card and the shape on the ground are one function (formation.ts)
  const { cells, w, h } = fleetFootprint(form, n, facing);
  const span = Math.max(w, h);
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-[3px] top-[3px] flex h-[18px] w-[18px] items-center justify-center border-[3px] bg-[#0d0d10]"
      style={{ borderColor: color }}
    >
      <svg viewBox={`0 0 ${span} ${span}`} className="h-[13px] w-[13px]">
        {/* centred in a square viewBox, so a quad and a citadel are drawn
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
 * THE CARD IN HAND. The turret's sprite on its rarity's own solid ground,
 * that colour's border round it, the shape's diagram in the corner in the
 * shape's own colour, and what it will put down written underneath.
 *
 * THE BORDER IS THE WHOLE POINT of the rarity system on this screen: a
 * player mid-wave has no time to read a word, and the difference between
 * grey and purple lands before the eye reaches the sprite.
 *
 * THE NUMBER UNDER THE SPRITE IS THE WHOLE FLEET — 360 and not 36 — and
 * the line under that says how it is arranged, because "10x Citadel" is
 * the thing a player is about to have to find ground for and the total is
 * the thing they are about to have on the board.
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
  const f = formationDef(card.form);
  const fr = RARITY[formationRarity(card.form)];
  const n = formationCount(card.form, card.n);
  const shape = card.n > 1 ? `${card.n}× ${f.name}` : f.name;
  const [sw, sh] = formationSpan(stats.size, card.form, card.n, facing);
  return (
    <button
      ref={tip.ref as RefObject<HTMLButtonElement | null>}
      {...tip.anchorProps}
      onClick={onToggle}
      aria-pressed={aimed}
      aria-label={`${n} ${stats.name}, ${r.name}, in ${shape}, ${fr.name} shape. ${
        aimed
          ? `Aimed, turned ${facing * 90} degrees — R turns it, click the board to place it.`
          : "Click to pick it up."
      }`}
      className={`ms-deal-card pointer-events-auto relative flex h-[5rem] w-[4.5rem] cursor-pointer flex-col items-center justify-center gap-0.5 border-[3px] p-0 ${
        aimed ? "" : "ms-deal-down"
      }`}
      style={{ borderColor: r.color, background: r.ground, color: r.color }}
    >
      <FormationMark form={card.form} n={card.n} facing={facing} />
      {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
      <img src={icon} alt="" className="mt-1.5 h-8 w-8 [image-rendering:pixelated]" />
      <span className="max-w-full px-0.5 text-center font-display text-[8px] font-bold uppercase leading-[1.15]">
        {n}× {stats.name}
      </span>
      <span className="max-w-full truncate px-0.5 font-display text-[7px] font-bold uppercase leading-none opacity-70">
        {shape}
      </span>
      <HoverCard tip={tip} title={`${n}× ${stats.name}`} tag={r.name} color={r.color} align="right">
        {TOWER_DESC[card.kind]}
        <span className="mt-1.5 block font-bold" style={{ color: fr.color }}>
          {shape} — {n} turrets, {sw}×{sh} tiles, {fr.name} shape
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
 * FOUR BUTTONS IN A 2x2, in a pane the size of the minimap's (13rem
 * inside a p-1 frame, which is what components/MechSwarm.tsx gives the
 * map on the other side). The two bottom corners are a matched pair now,
 * and each button is a big square target rather than a strip of text —
 * which is what a control pressed a hundred times a run, mid-wave,
 * without looking, has to be.
 *
 * READING ORDER IS THE ORDER OF A DECISION: the three things that can be
 * bought first — the turret (which goes on the ground) and then the two
 * halves of the module catalog (which never do) — and the AMOUNT last, in
 * the far corner, because it is the modifier on the other three rather
 * than a fourth thing to buy.
 */
function BuyButton({
  keyCap,
  label,
  sub,
  price,
  poor,
  disabled,
  amount,
  tint,
  glyph,
  onPress,
  aria,
}: {
  /** the printed letter, worn in the corner the way a command card's is */
  keyCap: string;
  label: string;
  /** the line under the price — what the press hands over, or why it is dark */
  sub: string;
  /** total scrap this press costs, or null when there is nothing to pay */
  price: number | null;
  poor: boolean;
  disabled?: boolean;
  /** the multiplier badge, drawn only while the amount is not 1 */
  amount: number;
  tint: string;
  glyph: ReactNode;
  onPress: () => void;
  aria: string;
}) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-keyshortcuts={keyCap}
      aria-label={aria}
      className={`ms-btn ms-btn-key ms-btn-tint relative flex h-full w-full flex-col items-center justify-center gap-1 px-1 py-1 ${
        !disabled && poor ? "opacity-60" : ""
      }`}
      style={{ ["--ms-tint" as string]: tint }}
    >
      <span className="ms-key">{keyCap}</span>
      {amount > 1 && !disabled && (
        <span
          className="pointer-events-none absolute right-[3px] top-[3px] font-display text-[9px] font-bold leading-none"
          style={{ color: tint }}
        >
          {"×"}
          {amount}
        </span>
      )}
      {glyph}
      <span className="max-w-full truncate font-display text-[10px] font-bold uppercase leading-none text-[#E8E4D8]">
        {label}
      </span>
      {price !== null && (
        <span
          className={`font-display text-[12px] font-bold leading-none tabular-nums ${
            poor ? "text-[#FF8A8A]" : "text-white"
          }`}
        >
          {price.toLocaleString()}
        </span>
      )}
      <span className="max-w-full truncate font-display text-[7px] font-bold uppercase leading-none text-[#8A8E98]">
        {sub}
      </span>
    </button>
  );
}

/** the turret: a gun from above, which is the shape of the thing bought */
const TURRET_GLYPH = (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden="true">
    <rect x="3" y="7" width="12" height="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M15 12h6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

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
  const revealed = useReveal(hud);
  const n = hud.amount;
  // WHAT A PRESS COSTS IS THE FLAT FEE TIMES THE AMOUNT, everywhere — no
  // bulk discount lives anywhere in this game (economy.ts BUY_AMOUNTS)
  const turretCost = hud.rollPrice * n;
  const modCost = hud.modPrice * n;
  const relicCost = hud.relicPrice * n;
  const short = (cost: number): boolean => hud.scrap !== null && hud.scrap < cost;
  const free = hud.scrap === null;
  return (
    <div className="flex flex-col items-end gap-2">
      <ModReveal ids={revealed} />
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
          className="grid h-[13rem] w-[13rem] grid-cols-2 grid-rows-2 gap-1"
        >
          <BuyButton
            keyCap="T"
            label={card ? "Re-roll" : "Turret"}
            sub={n > 1 ? `${n} of the shape` : "one card"}
            price={free ? null : turretCost}
            poor={short(turretCost)}
            amount={n}
            tint="#FFD37F"
            glyph={TURRET_GLYPH}
            onPress={deal.buy}
            aria={`${card ? "Re-roll" : "Buy"} turret at ${n} times the shape for ${turretCost} scrap, shortcut T`}
          />
          {/* THE TWO HALVES OF THE CATALOG (mods.ts). Each goes dark on
              its OWN half being shut, which is the one case a press would
              take the money for nothing — so a run that has taken every
              relic keeps buying mods.
              A DARK BUTTON SAYS WHICH KIND OF DARK IT IS (game.ts
              DealHalf): "all owned" is a run that has taken everything
              there is, and "locked" is a save the track has not dealt
              this half to yet — relics open at a level (track.ts
              RELICS_FROM), so the G button starts shut and a player owed
              an explanation gets one rather than being told they own
              relics they have never seen */}
          <BuyButton
            keyCap="M"
            label="Mods"
            sub={
              hud.modDeal !== "open"
                ? HALF_SUB[hud.modDeal]
                : n > 1
                  ? `${n} draws`
                  : "on new turrets"
            }
            price={hud.modDeal === "open" && !free ? modCost : null}
            poor={short(modCost)}
            disabled={hud.modDeal !== "open"}
            amount={n}
            tint="#7BDFF2"
            glyph={<Glyph glyph="barrel" className="h-[22px] w-[22px]" />}
            onPress={deal.buyMods}
            aria={
              hud.modDeal === "open"
                ? `Buy ${n} turret mod${n > 1 ? "s" : ""} for ${modCost} scrap, shortcut M`
                : hud.modDeal === "owned"
                  ? "Buy mods — every turret mod is owned"
                  : "Buy mods — locked until the track opens one"
            }
          />
          <BuyButton
            keyCap="G"
            label="Relics"
            sub={
              hud.relicDeal !== "open"
                ? HALF_SUB[hud.relicDeal]
                : n > 1
                  ? `${n} draws`
                  : "in force now"
            }
            price={hud.relicDeal === "open" && !free ? relicCost : null}
            poor={short(relicCost)}
            disabled={hud.relicDeal !== "open"}
            amount={n}
            tint="#C08BFF"
            glyph={<Glyph glyph="star" className="h-[22px] w-[22px]" />}
            onPress={deal.buyRelics}
            aria={
              hud.relicDeal === "open"
                ? `Buy ${n} relic${n > 1 ? "s" : ""} for ${relicCost} scrap, shortcut G`
                : hud.relicDeal === "owned"
                  ? "Buy relics — every relic is owned"
                  : "Buy relics — locked until the track opens one"
            }
          />
          {/* THE AMOUNT COMES LAST, in the far corner of the square,
              because it is the MODIFIER on the other three and not a
              fourth thing to buy — the quantity field goes after the
              item. It is the only one of the four that spends nothing, so
              it is the only one with no price on it, and it wears the
              gold pressed-in band while it is off 1: a run that has
              forgotten it is buying in tens is a run about to spend ten
              thousand scrap by accident */}
          <button
            onClick={deal.cycleAmount}
            aria-keyshortcuts="X"
            aria-label={`Amount: ${n} per press. Click to cycle, shortcut X`}
            className={`ms-btn ms-btn-key relative flex h-full w-full flex-col items-center justify-center gap-1 px-1 py-1 ${
              n > 1 ? "ms-on" : ""
            }`}
          >
            <span className="ms-key">X</span>
            <span className="font-display text-[26px] font-bold leading-none tabular-nums">
              {"×"}
              {n}
            </span>
            <span className="font-display text-[10px] font-bold uppercase leading-none text-[#E8E4D8]">
              Amount
            </span>
            <span className="font-display text-[7px] font-bold uppercase leading-none text-[#8A8E98]">
              per press
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
