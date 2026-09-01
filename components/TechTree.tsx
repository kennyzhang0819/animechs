"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, TOWERS } from "@/game/constants";
import {
  affordablePoints,
  buyTech,
  nodeStatus,
  refundTech,
  isTechOn,
  saveTechOn,
  type NodeStatus,
  type Progress,
} from "@/game/progress";
import {
  isRefundable,
  isToggleable,
  isTowerNode,
  isUpgradeNode,
  techCap,
  TECH_TREE,
  techNode,
  techPrice,
  UTILITY_INFO,
  type TechKind,
} from "@/game/tech";
import {
  TURRET_UPGRADES,
  upgradeDef,
  upgradeParent,
  MAX_RUNGS,
  ULTIMATE_TIER,
  type TurretUpgradeDef,
  type UpgradeGlyph,
} from "@/game/upgrades";
import type { TowerKind } from "@/game/types";
import {
  MUTATIONS,
  MUT_PICK_MAX,
  MUT_PICK_MIN,
  mutationBudget,
  type MutationDef,
} from "@/game/mutation";
import { RUNG_COUNT, rungColor, rungLabel } from "@/game/ladder";
import { CostRow, Wallet } from "./Items";
import { TOWER_ICONS } from "./towerIcons";

/** what a node is called — turret stats, the upgrade table, or UTILITY_INFO */
const nodeName = (id: TechKind): string =>
  isTowerNode(id)
    ? TOWERS[id].name
    : isUpgradeNode(id)
      ? upgradeDef(id).name
      : UTILITY_INFO[id].name;

/**
 * The node's face.
 *
 * Turrets and home have sprites. The utility nodes do not — there is no
 * block in Mindustry that means "run the clock faster" — so they get a glyph
 * instead: fast-forward for the pace switches (the name underneath says
 * which multiplier), and a grid of squares for the slot nodes that widen
 * the build bar's loadout.
 */
const FF_GLYPH = "M2 4v16l10-8zM12 4v16l10-8z";
const SLOT_GLYPH = "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z";
/** a bolt — duo rate of fire, the node that makes the barrel run hot */
const ROF_GLYPH = "M13 2 4 14h6l-1 8 9-12h-6z";
/** a shot leaving two bodies behind it — duo pierce */
const PIERCE_GLYPH = "M1 11h3v2H1zM7 11h3v2H7zM13 11h3V8l6 4-6 4v-3h-3z";

/** the glyph a sprite-less node wears; the pace switches are the default */
const GLYPH: Partial<Record<TechKind, string>> = {
  "slot-7": SLOT_GLYPH,
  "slot-8": SLOT_GLYPH,
};

/**
 * THE UPGRADE CHIPS' FACES. An upgrade node has no block to wear — there is
 * no Mindustry sprite that means "five per cent more blast radius" — so the
 * branches share a small vocabulary of glyphs and every rung names the one
 * that fits it (TurretUpgradeDef.glyph). Reusing a dozen shapes across
 * every branch in the game is the point: a bolt means rate of fire on every
 * turret there is, so a row can be read at a glance without opening a card.
 *
 * `surge` is the exception and never appears here — an ultimate wears the
 * surge alloy it costs (SURGE_ICON), because the thing that makes it an
 * ultimate IS the currency.
 */
const UPGRADE_GLYPH: Record<Exclude<UpgradeGlyph, "surge">, string> = {
  rate: ROF_GLYPH,
  pierce: PIERCE_GLYPH,
  // a wall on the left and a shot running away from it
  range: "M3 11h11V8l6 4-6 4v-3H3zM0 4h2v16H0z",
  // a round, nose up
  damage: "M12 2 8 8v9a4 4 0 0 0 8 0V8z",
  // a four-pointed burst
  splash: "M12 1l2.2 6.8L21 10l-6.8 2.2L12 19l-2.2-6.8L3 10l6.8-2.2z",
  // a flame
  burn: "M12 2c3 4 1 5 3 8 1-1 1-2 1-3 2 2 3 5 3 7a7 7 0 0 1-14 0c0-3 2-6 5-8 1 2 1 3 2 4 1-3 0-5 0-8z",
  // a snowflake
  frost: "M11 1h2v22h-2zM2.2 5.6l1-1.73 18.6 10.74-1 1.73zM21.8 5.6l1 1.73L4.2 18.07l-1-1.73z",
  // a clock: how long a status hangs on the thing it landed on
  duration:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15zM11 6h2v6.4l4.2 2.5-1 1.7L11 13.5z",
  // a crosshair with a lock in the middle
  homing:
    "M11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z",
  // a fan of shots leaving one muzzle
  spread: "M12 21 3 6l2-1 7 11 7-11 2 1z",
  // a beam with flare above and below
  beam: "M2 10h20v4H2zM4 5h4v2H4zM16 5h4v2h-4zM4 17h4v2H4zM16 17h4v2h-4z",
  // a flyer seen from below, and a shot going up at it
  air: "M12 2 4 10h5l-1 5 4-3 4 3-1-5h5zM7 19h10v2H7z",
};

/** the item an ultimate is paid for, and the face it wears */
const SURGE_ICON = "/mindustry/sprites/items/item-surge-alloy.png";

/**
 * SURGE ALLOY'S OWN COLOUR (Mindustry Items.surgeAlloy, f3e979), and the
 * one colour on this board that is not the tree's gold.
 *
 * Gold means BOUGHT. An ultimate is bought too, so gold would have been
 * true and useless — the whole job of the fourth chip is to read as a
 * different KIND of thing from the three beside it, at a glance, without
 * being hovered. So it gets its own shape (a hexagon, not a rounded
 * square), its own colour, and, when it is lit and switched on, a halo
 * that moves. Nothing else on the board moves.
 */
const SURGE = "#F3E979";

/** utility nodes whose face is a block sprite rather than a glyph: the
 *  projector node wears the block it is a reservation for */
const UTIL_ICONS: Partial<Record<TechKind, string>> = {
  "overdrive-projector": "/mindustry/sprites/blocks/defense/overdrive-projector.png",
  // the two one-shot duo nodes wear the item that IS them: a graphite round
  // is graphite, and Duo Power's whole gate is the one surge alloy it costs
  "duo-graphite": "/mindustry/sprites/items/item-graphite.png",
  "duo-power": "/mindustry/sprites/items/item-surge-alloy.png",
};

function NodeIcon({ id, lit }: { id: TechKind; lit: boolean }) {
  const sprite = isTowerNode(id)
    ? TOWER_ICONS[id]
    : id === "home"
      ? HOME_ICON
      : UTIL_ICONS[id];
  if (sprite)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite
      <img
        src={sprite}
        alt=""
        className={`h-14 w-14 [image-rendering:pixelated] ${lit ? "" : "grayscale"}`}
      />
    );
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-10 w-10 ${lit ? "fill-[#FFD37F]" : "fill-[#71717C]"}`}
      aria-hidden="true"
    >
      <path fillRule="evenodd" d={GLYPH[id] ?? FF_GLYPH} />
    </svg>
  );
}

const HOME_ICON = "/mindustry/sprites/blocks/storage/core-shard.png";

/**
 * THE MUTATOR CODEX — a PANEL on this page, and deliberately NOT a branch
 * of the board behind it.
 *
 * Mutation used to be the tree's left column: a chain of switches hanging
 * off home that a player flipped on for a harder run. It is not that any
 * more (see mutation.ts). Mutators are ROLLED — the map decides that it
 * mutates, the difficulty decides how many points the roll may spend, and
 * three or four rules come back. There is nothing here to buy, nothing to
 * own and nothing to switch, so there is nothing for a node to BE.
 *
 * IT STILL BELONGS ON THIS PAGE. This is the screen a player comes to in
 * order to ask "what can happen to me, and what can I do about it" — the
 * wallet, the prices and the ladder colours all live here. A codex that
 * lists every rule that can be rolled, and what each is worth, is the
 * other half of that question. It just must not be reachable BY MISTAKE
 * from a board where every other click spends money, which is what a
 * chrome button and a panel buy that an eleventh branch cannot.
 *
 * WHAT IT SHOWS AND WHY. Every mutator, cheapest first, with its point
 * cost — and the budget every difficulty hands the roller. Nothing is
 * hidden and nothing is teased: a player about to deploy onto a mutating
 * map is entitled to know the whole pool it will be drawn from, exactly
 * as a StarCraft II player can read the mutator list before queueing. The
 * surprise is meant to be WHICH ones, not what exists.
 */
/** the codex's colour, kept from the old column — deliberately NOT the
 *  tree's gold, because gold on this page means "bought, owned, yours" */
const MUT_LIT = "#FF8ACB";
/** three chevrons climbing — the codex button's face, and the fallback
 *  card glyph for a mutator with no face of its own */
const MUT_GLYPH = "M12 2 4 9h5v2H4l8 7 8-7h-5V9h5z";
/** a disc with a wedge bitten out of it — Hungry's maw */
const HUNGER_GLYPH = "M12 2a10 10 0 1 0 8.66 15L12 12l8.66-5A9.98 9.98 0 0 0 12 2z";
/** a chevron pair running right — Speedy */
const SPEED_GLYPH = "M2 5l8 7-8 7V5zM12 5l8 7-8 7V5z";

/** the face a mutator wears on its card; MUT_GLYPH is the fallback, so a
 *  rule added without art still draws as something */
const MUT_FACE: Record<string, string> = {
  hungry: HUNGER_GLYPH,
  speedy: SPEED_GLYPH,
};

/**
 * WHAT A COST MEANS, in one word — the scale documented on MUT_COST_MIN.
 * A number alone says a mutator is dearer than another one; the word says
 * what dearer BUYS, which is the thing a player reading the list for the
 * first time actually needs.
 */
const costBand = (cost: number): { label: string; color: string } =>
  cost <= 2
    ? { label: "Light", color: "#7BE58A" }
    : cost <= 4
      ? { label: "Heavy", color: "#FFB65C" }
      : { label: "Brutal", color: "#FF6B6B" };

/** one mutator, as the codex lists it */
function MutationCard({ def }: { def: MutationDef }) {
  const band = costBand(def.cost);
  return (
    <li className="flex gap-3 rounded border border-[#2E2E36] bg-[#151518] p-3">
      <svg
        viewBox="0 0 24 24"
        className="mt-0.5 h-8 w-8 shrink-0 fill-[#FF8ACB]"
        aria-hidden="true"
      >
        <path fillRule="evenodd" d={MUT_FACE[def.id] ?? MUT_GLYPH} />
      </svg>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-bold text-[#EDEDEF]">{def.name}</span>
          <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: band.color }}>
            {band.label}
          </span>
          <span className="ml-auto shrink-0 rounded border border-[#FF8ACB] px-1.5 text-[13px] font-bold text-[#FF8ACB]">
            {def.cost} pts
          </span>
        </div>
        <p className="mt-1 text-[14px] leading-snug text-[#A6A6AF]">{def.blurb}</p>
      </div>
    </li>
  );
}

/**
 * THE PANEL. A dialog over the board rather than a screen of its own: the
 * tree is what the player was looking at, and what a mutator costs them is
 * only meaningful next to what they can afford to answer it with.
 *
 * THE BUDGET ROW IS THE POINT OF THE WHOLE PANEL. The catalog alone reads
 * as trivia; the catalog beside "difficulty 7 spends 17 points on three or
 * four of these" is a plan. It is drawn in the ladder's own rung colours,
 * so the row lines up with every other place a difficulty is named.
 */
function MutationPanel({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4"
      onPointerDown={(e) => {
        // the backdrop closes; a press inside the panel is the panel's
        if (e.target === e.currentTarget) onClose();
      }}
      data-ui
    >
      <div
        role="dialog"
        aria-label="Mutators"
        className="flex max-h-full w-full max-w-lg flex-col rounded border border-[#FF8ACB] bg-[#101013] p-4 shadow-lg"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold uppercase tracking-widest text-[#FF8ACB]">
            Mutators
          </h2>
          <button
            onClick={onClose}
            aria-label="close"
            className="rounded border border-[#2E2E36] px-2 py-0.5 text-[13px] uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF8ACB]"
          >
            Close
          </button>
        </div>
        <p className="mt-2 text-[14px] leading-snug text-[#A6A6AF]">
          Some maps are always played under mutators. You do not choose them:
          the difficulty you pick sets a point budget, and{" "}
          <span className="font-bold text-[#EDEDEF]">
            {MUT_PICK_MIN} to {MUT_PICK_MAX} rules
          </span>{" "}
          are rolled to fit it when you deploy. Every rule changes a wave
          after it lands — never what the map sends you.
        </p>

        <div className="mt-3 border-t border-[#2E2E36] pt-3">
          <div className="text-[12px] uppercase tracking-widest text-[#71717C]">
            Budget by difficulty
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {Array.from({ length: RUNG_COUNT }, (_, t) => (
              <div
                key={t}
                title={`${rungLabel(t)}: ${mutationBudget(t)} points`}
                className="flex min-w-[38px] flex-1 flex-col items-center rounded border border-[#2E2E36] bg-[#151518] px-1 py-0.5"
              >
                <span className="text-[11px] font-bold" style={{ color: rungColor(t) }}>
                  {t + 1}
                </span>
                <span className="text-[13px] font-bold text-[#EDEDEF]">
                  {mutationBudget(t)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <ul className="mt-3 flex-1 space-y-2 overflow-y-auto border-t border-[#2E2E36] pt-3">
          {MUTATIONS.map((m) => (
            <MutationCard key={m.id} def={m} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// board geometry: nodes are squares centered in grid cells; the SVG edge
// layer underneath connects cell centers.
const NODE = 88;
/**
 * One upgrade chip, and the row a turret wears under its name.
 *
 * THE ROW IS AS WIDE AS ITS OWN BRANCH IS LONG, not as wide as the longest
 * one: most turrets carry three rungs and duo and arc carry four (see
 * upgrades.ts), and padding the short rows out to four would draw an empty
 * slot that reads as a node failing to render. The widest possible row is
 * only what the CELL has to be able to hold.
 */
const CHIP = 38;
const CHIP_GAP = 6;
const rowWidth = (rungs: number): number => rungs * CHIP + (rungs - 1) * CHIP_GAP;
/** how far below a node's centre the chip row hangs — under the name label */
const ROW_TOP = NODE / 2 + 22;

// THE CELL GREW WHEN THE UPGRADE ROWS ARRIVED. Every turret now carries a
// row of chips under its name, so a cell has to hold the node, its label
// and the widest of those rows — which is also why the whole board opens
// further out than it used to. The alternative was a box on the grid for
// every rung, with an edge of its own to reach it, and the wings have
// nowhere to put either without breaking the no-crossing rule (see
// TechNodeDef.x).
const CELL_W = rowWidth(MAX_RUNGS) + 20;
const CELL_H = 180;
const ALL_X = TECH_TREE.map((n) => n.x);
const ALL_Y = TECH_TREE.map((n) => n.y);
// The utility chain runs NORTH out of home, so the grid starts at neither
// zero: board space is the node grid SHIFTED to start at the origin on
// BOTH axes. Every reader goes through centerX/centerY, so this is the
// only place that has to know where the grid actually begins.
const MIN_X = Math.min(...ALL_X);
const MIN_Y = Math.min(...ALL_Y);
const BOARD_W = (Math.max(...ALL_X) - MIN_X + 1) * CELL_W;
const BOARD_H = (Math.max(...ALL_Y) - MIN_Y + 1) * CELL_H;

const centerX = (x: number): number => (x - MIN_X + 0.5) * CELL_W;
const centerY = (y: number): number => (y - MIN_Y + 0.5) * CELL_H;

/**
 * THE TREE IS A MAP, NOT A PAGE. It used to be a vertically scrolling
 * document, which stopped working the moment the board outgrew one screen
 * in BOTH axes — a page can only scroll one way, and the game one keystroke
 * away already taught everyone its camera. So the board is a fixed viewport
 * over a transformed layer, driven exactly like the field: WASD and arrows
 * pan, the wheel zooms about the cursor (a ctrl-tagged pinch delta uses a
 * stronger factor), the floating buttons zoom, and any drag on open ground
 * or a node drags the board. The chrome floats over it.
 *
 * The camera lives in a REF and is applied to the layer imperatively:
 * panning at 60fps must not re-render the tree, and a re-render from
 * buying a point re-applies the same transform from the ref, so the two
 * paths can never disagree.
 */
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;
/** screen px of board that can never be panned off screen */
const EDGE_KEEP = 140;
/** pan speed while a key is held, in SCREEN px/s — zoom-independent */
const PAN_SPEED = 900;
/** finger travel (screen px) past which a gesture is a drag, not a tap */
const DRAG_PX = 8;

const PAN_KEYS: Readonly<Record<string, readonly [number, number]>> = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowRight: [1, 0],
};

/**
 * How many points one click buys. The volume turret is flat-priced, so a
 * mid-campaign bank buys duos by the thousand — a tree that could only be
 * clicked one point at a time would make the game's central action its most
 * tedious one. "Max" spends everything the wallet covers on that one node.
 */
const BUY_STEPS = [1, 10, 100, "max"] as const;
type BuyStep = (typeof BUY_STEPS)[number];

const stepLabel = (s: BuyStep): string => (s === "max" ? "Max" : `×${s}`);

/**
 * How many points this step would actually land right now. The utilities
 * cap at one point (tech.ts), so the step is a ceiling they simply never
 * reach — no special case is needed here.
 */
const stepCount = (p: Progress, node: TechKind, step: BuyStep): number =>
  affordablePoints(p, node, step === "max" ? Infinity : step);

/**
 * WHAT AN UPGRADE IS WORTH AT ITS CURRENT POINT COUNT, in the units the
 * player actually feels.
 *
 * The blurb says what a node does; this says what it is DOING. A stacking
 * node is bought a point at a time over a whole campaign, and "5% per
 * point" is no help at all to someone deciding whether the fourteenth one
 * is worth 60,000 copper — "+65% attack speed → +70%" is. The sentence
 * itself belongs to the rung (TurretUpgradeDef.effect); this only pins the
 * "after this click" half onto it.
 */
function upgradeEffect(def: TurretUpgradeDef, points: number, next: number): string | null {
  if (!def.effect) return null;
  const now = def.effect(points);
  return next > points ? `${now} → ${def.effect(next)}` : now;
}

/**
 * ONE UPGRADE CHIP, and the whole of the second half of this board.
 *
 * IT IS A NODE, NOT A BADGE. It buys points, it holds a count, it has a
 * price card and it obeys the same touch rule as everything else here. All
 * that is different is that it is small and it hangs off its turret
 * instead of standing on the grid — see the note over CELL_W for why these
 * could not be boxes.
 *
 * WHAT A CLICK DOES, and the one place this board's rules changed:
 *
 *   something left to buy  ->  buy it, `step` points at a time
 *   bought out (a one-shot, or a dial at its cap) -> SWITCH IT ON OR OFF
 *
 * The second line is new. A maxed node used to be inert — it refused every
 * click and said "maxed" — and the switch that turned its effect off was a
 * separate pill hung off the corner, which is exactly the kind of control
 * that is missed. Toggling is also the SAFE action of the two a bought
 * rung offers, which is why it is the one on the chip: the other is a
 * refund, and a refund on the same click that used to buy would sooner or
 * later be an accident. That one lives in the card, spelled out, with the
 * currency it hands back printed under it.
 *
 * A RUNG WHOSE PARENT IS UNBOUGHT IS STILL DRAWN, dimmed, which is a
 * deliberate exception to the tree's own hide-until-the-parent-is-bought
 * rule. That rule is about not advertising branches; the row of chips
 * under a turret is not a branch to discover, it is the SHAPE of what the
 * turret can become, and drawing two chips and a gap would read as a bug.
 * The card on a locked chip says which rung comes first.
 */
function UpgradeChip({
  def,
  progress,
  step,
  touch,
  armed,
  onArm,
  onChanged,
}: {
  def: TurretUpgradeDef;
  progress: Progress;
  step: BuyStep;
  touch: boolean;
  armed: boolean;
  onArm: () => void;
  onChanged: () => void;
}) {
  const status: NodeStatus = nodeStatus(progress, def.id);
  const points = progress.tech[def.id] ?? 0;
  const owned = points > 0;
  const maxed = points >= def.cap;
  const locked = status === "hidden";
  const on = isTechOn(progress, def.id);
  const ultimate = def.tier >= ULTIMATE_TIER;
  const lit = owned && on;
  // the step is a ceiling, not a promise: a "x100" the wallet only half
  // covers lands what it covers rather than refusing
  const willBuy = status === "buyable" ? stepCount(progress, def.id, step) : 0;
  // a bought-out rung has nothing left to sell, so its click is the switch
  const toggles = maxed && isToggleable(def.id);
  const clickable = status === "buyable" || toggles;
  const showCard = touch && armed;

  const colour = locked
    ? { line: "#2E2E36", face: "#141417", ink: "#4A4A55" }
    : lit && ultimate
      ? { line: SURGE, face: "#241F0C", ink: SURGE }
      : lit
        ? { line: "#FFD37F", face: "#222227", ink: "#FFD37F" }
        : owned
          ? { line: "#5A2A2A", face: "#171214", ink: "#71717C" }
          : { line: "#4A4A55", face: "#151518", ink: "#71717C" };

  const face =
    def.glyph === "surge" ? (
      // eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite
      <img
        src={SURGE_ICON}
        alt=""
        className={`h-5 w-5 [image-rendering:pixelated] ${lit ? "" : "grayscale opacity-70"}`}
      />
    ) : (
      <svg viewBox="0 0 24 24" className="h-5 w-5" style={{ fill: colour.ink }} aria-hidden="true">
        <path fillRule="evenodd" d={UPGRADE_GLYPH[def.glyph]} />
      </svg>
    );

  return (
    <div className="group/chip relative" style={{ width: CHIP, height: CHIP }}>
      <button
        type="button"
        aria-disabled={!clickable}
        aria-label={
          locked
            ? `${def.name}: locked, buy ${nodeName(upgradeParent(def.id) ?? def.turret)} first`
            : clickable && touch && !armed
              ? `${def.name}: show details, tap again to act`
              : toggles
                ? `${def.name}: ${on ? "on, activate to switch off" : "off, activate to switch on"}`
                : owned
                  ? `${def.name}: ${points} of ${def.cap} points`
                  : `Unlock ${def.name}`
        }
        onClick={() => {
          // an unbuyable chip still opens its card on touch — "why not" is
          // the question it most needs to answer
          if (touch && !armed) {
            onArm();
            return;
          }
          if (toggles) {
            saveTechOn(def.id, !on);
            onChanged();
            return;
          }
          if (status !== "buyable") return;
          if (buyTech(def.id, Math.max(1, willBuy))) onChanged();
        }}
        className={`group/face relative flex h-full w-full items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 ${
          clickable ? "cursor-pointer" : "cursor-not-allowed"
        } ${locked ? "opacity-40" : ""}`}
        style={{ outlineColor: ultimate ? SURGE : "#FFD37F" }}
      >
        {ultimate ? (
          // THE HEXAGON. An ultimate is not a bigger version of the three
          // chips beside it, so it is not the same shape as them either —
          // and a border cannot be clipped into a hexagon with CSS without
          // losing the border, so the outline is drawn as a polygon
          <svg
            viewBox="0 0 100 100"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {lit && (
              // the halo: a second hexagon breathing out of the first, and
              // the only moving thing on the board
              <polygon
                points={HEX}
                fill="none"
                stroke={SURGE}
                strokeWidth={5}
                className="origin-center animate-[surge-halo_2.6s_ease-out_infinite] motion-reduce:hidden"
              />
            )}
            <polygon
              points={HEX}
              fill={colour.face}
              stroke={colour.line}
              strokeWidth={7}
              strokeLinejoin="round"
              className={lit ? "animate-[surge-glow_2.6s_ease-in-out_infinite] motion-reduce:animate-none" : ""}
            />
          </svg>
        ) : (
          <span
            className={`absolute inset-0 rounded-md border-2 ${
              // the reachable-but-unbought chips are the ones a player is
              // deciding between, and a dim square that lights under the
              // pointer is how they tell themselves apart from the locked
              // ones two places along
              !owned && !locked ? "group-hover/face:border-[#FFD37F]" : ""
            }`}
            style={{ borderColor: colour.line, background: colour.face }}
          />
        )}
        <span className="relative flex items-center justify-center">{face}</span>
        {/* the count, on a dial that is holding points. A one-shot has no
            number — it is lit or it is not */}
        {owned && def.cap > 1 && (
          <span
            className="absolute -bottom-1.5 -right-1.5 rounded border bg-[#101013] px-1 text-[11px] font-bold leading-tight"
            style={{ borderColor: colour.line, color: colour.ink }}
          >
            {points}
          </span>
        )}
        {/* switched off: the points are still owned, so say so on the chip
            rather than only in a card nobody has opened */}
        {owned && !on && (
          <span className="absolute -top-1.5 -right-1.5 h-2.5 w-2.5 rounded-full border border-[#101013] bg-[#FF8A8A]" />
        )}
      </button>
      {/* the card. UNLIKE EVERY OTHER CARD ON THIS BOARD IT TAKES CLICKS,
          because a bought ultimate has an action that cannot go on the chip
          (the refund). The gap to the chip is PADDING rather than margin so
          a mouse travelling up to press that button never crosses dead
          ground and closes the card under itself */}
      <div
        className={`absolute bottom-full left-1/2 z-20 w-64 -translate-x-1/2 pb-2 text-left ${
          showCard ? "block" : "hidden group-hover/chip:block group-focus-within/chip:block"
        }`}
      >
        <div className="rounded border border-[#4A4A55] bg-[#151518] p-3 shadow-lg">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-bold text-[#EDEDEF]">{def.name}</span>
            <span className="shrink-0 text-[13px] text-[#A6A6AF]">
              {locked
                ? "Locked"
                : def.cap > 1
                  ? `${points} / ${def.cap}`
                  : owned
                    ? on
                      ? "On"
                      : "Off"
                    : "Not bought"}
            </span>
          </div>
          <div className="mt-0.5 text-[12px] uppercase tracking-widest text-[#71717C]">
            {TOWERS[def.turret].name} · upgrade {def.tier} of{" "}
            {TURRET_UPGRADES[def.turret].length}
          </div>
          <div className="mt-1 text-[14px] text-[#A6A6AF]">{def.blurb}</div>
          {!locked &&
            (() => {
              const line = upgradeEffect(def, points, points + Math.max(0, willBuy));
              return line ? (
                <div className="mt-1 text-[14px] font-bold text-[#FFD37F]">{line}</div>
              ) : null;
            })()}
          {owned && !on && (
            <div className="mt-2 text-[14px] font-bold text-[#FF8A8A]">
              Switched off — the points are still yours, they are just not in play.
            </div>
          )}
          {locked ? (
            <div className="mt-2 border-t border-[#2E2E36] pt-2 text-[13px] font-bold uppercase tracking-widest text-[#A6A6AF]">
              Buy {nodeName(upgradeParent(def.id) ?? def.turret)} first
            </div>
          ) : maxed ? (
            <div className="mt-2 space-y-2 border-t border-[#2E2E36] pt-2">
              {toggles && (
                <div className="text-[13px] font-bold uppercase tracking-widest" style={{ color: on ? "#7BE58A" : "#FF8A8A" }}>
                  {touch ? "Tap again" : "Click"} to switch {on ? "off" : "on"}
                </div>
              )}
              {/* THE REFUND, and the only control on this board that undoes
                  a purchase. It is a labelled button rather than a second
                  meaning for the chip's own click, because surge alloy is
                  paid out one boss fight at a time and an accidental sale
                  is not a thing a player can simply re-earn */}
              {isRefundable(def.id) && (
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      if (refundTech(def.id)) onChanged();
                    }}
                    className="w-full rounded border border-[#5A4A2A] bg-[#1A160C] px-2 py-1 text-[13px] font-bold uppercase tracking-widest text-[#F3E979] hover:border-[#F3E979]"
                  >
                    Sell back
                  </button>
                  <div className="mt-1">
                    <CostRow cost={techPrice(def.id, points - 1)} bank={progress.bank} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 border-t border-[#2E2E36] pt-2 text-[14px]">
              {/* the full bundle: passing the bank reddens exactly the
                  stacks it cannot cover, which is the whole "why can't I
                  buy this" explanation */}
              <CostRow cost={techPrice(def.id, points)} bank={progress.bank} />
              {showCard && status === "buyable" && (
                <div className="mt-2 text-[13px] font-bold uppercase tracking-widest text-[#FFD37F]">
                  Tap again to buy
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** the hexagon an ultimate is drawn as, in the chip's own 100x100 box */
const HEX = "26,4 74,4 96,50 74,96 26,96 4,50";

/** the four rungs under one turret, in tier order */
function UpgradeRow({
  turret,
  x,
  y,
  progress,
  step,
  touch,
  armed,
  onArm,
  onChanged,
}: {
  turret: TowerKind;
  x: number;
  y: number;
  progress: Progress;
  step: BuyStep;
  touch: boolean;
  armed: string | null;
  onArm: (id: TechKind) => void;
  onChanged: () => void;
}) {
  const rungs = TURRET_UPGRADES[turret];
  const w = rowWidth(rungs.length);
  return (
    <div
      className="absolute flex"
      style={{
        left: centerX(x) - w / 2,
        top: centerY(y) + ROW_TOP,
        width: w,
        gap: CHIP_GAP,
      }}
    >
      {rungs.map((def) => (
        <UpgradeChip
          key={def.id}
          def={def}
          progress={progress}
          step={step}
          touch={touch}
          armed={armed === def.id}
          onArm={() => onArm(def.id)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

/**
 * Does this device answer a resting pointer with hover?
 *
 * A mouse reads a node before spending on it for free — you rest on it, the
 * price card opens, you decide. A finger has no resting state: the only way
 * it can ask "what is this and what does it cost" is to press the thing, and
 * on a tree where pressing SPENDS, that question costs money to ask.
 *
 * So on a touchscreen the first tap on a node is the hover — it opens the
 * card and buys nothing — and every tap after it on that same node buys, so
 * a player who wants ten points still just taps ten more times. Desktop is
 * untouched: hover already separates reading from buying there, and making a
 * mouse click twice would be a tax paid for a problem it does not have.
 */
function useTouchOnly(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none)");
    const read = (): void => setTouch(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return touch;
}

export default function TechTree({
  progress,
  onChanged,
  onBack,
  backLabel = "Back",
  onRestart,
}: {
  progress: Progress;
  /** a point was bought — the caller re-reads the save */
  onChanged: () => void;
  /** the standard top-left icon button — always the way OUT of the tree */
  onBack: () => void;
  /** the back button's accessible name — the icon carries no text */
  backLabel?: string;
  /** set when the tree was opened from a finished run: adds a labelled
   * Restart button beside back, starting the run again with what was
   * just bought. Back then leaves to the menu instead. */
  onRestart?: () => void;
}) {
  const [step, setStep] = useState<BuyStep>(1);
  const touch = useTouchOnly();
  // the one node a finger has already asked about, and so the one node a tap
  // is allowed to spend on. Tapping a different node moves the question there
  // rather than buying it
  const [armed, setArmed] = useState<string | null>(null);
  // is the mutator codex open? It is a panel over the board rather than a
  // branch of it — see the note above MutationPanel
  const [codex, setCodex] = useState(false);

  // ---- the camera (see the note above PAN_KEYS) -------------------------
  const viewRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // (x, y) is the visible top-left in board px, z the scale
  const cam = useRef({ x: 0, y: 0, z: 1 });
  const camPlaced = useRef(false);
  // live pointers, for drag-pan and pinch; screen px travelled this gesture,
  // which is what tells a tap (buy) from a drag (pan) on the same node
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragPx = useRef(0);
  const keysDown = useRef(new Set<string>());

  const camCss = (): string => {
    const c = cam.current;
    return `translate(${-c.x * c.z}px, ${-c.y * c.z}px) scale(${c.z})`;
  };

  /** clamp so EDGE_KEEP screen px of board always stay on screen, then
   *  write the transform straight onto the layer — no re-render to pan */
  const applyCam = useCallback((): void => {
    const view = viewRef.current, board = boardRef.current;
    if (!view || !board) return;
    const c = cam.current;
    c.x = clamp(c.x, -(view.clientWidth - EDGE_KEEP) / c.z, BOARD_W - EDGE_KEEP / c.z);
    c.y = clamp(c.y, -(view.clientHeight - EDGE_KEEP) / c.z, BOARD_H - EDGE_KEEP / c.z);
    board.style.transform = camCss();
  }, []);

  /** zoom about a screen point, so what is under the cursor stays put */
  const zoomAt = useCallback(
    (sx: number, sy: number, factor: number): void => {
      const c = cam.current;
      const z2 = clamp(c.z * factor, ZOOM_MIN, ZOOM_MAX);
      c.x += sx / c.z - sx / z2;
      c.y += sy / c.z - sy / z2;
      c.z = z2;
      applyCam();
    },
    [applyCam],
  );

  /** the floating +/- buttons and the +/- keys zoom about the middle */
  const zoomCenter = useCallback(
    (factor: number): void => {
      const view = viewRef.current;
      if (!view) return;
      zoomAt(view.clientWidth / 2, view.clientHeight / 2, factor);
    },
    [zoomAt],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // first mount: fit the whole board on screen, centered, and never again
    // — a re-render from buying a point must not yank the camera home
    if (!camPlaced.current) {
      camPlaced.current = true;
      const z = clamp(
        Math.min(view.clientWidth / (BOARD_W + 120), view.clientHeight / (BOARD_H + 200)),
        ZOOM_MIN,
        1.15,
      );
      cam.current = {
        x: (BOARD_W - view.clientWidth / z) / 2,
        y: (BOARD_H - view.clientHeight / z) / 2,
        z,
      };
    }
    applyCam();

    // native and non-passive: React's wheel listener cannot preventDefault,
    // and without it a ctrl+wheel (which is also what a trackpad pinch
    // arrives as) zooms the PAGE instead of the board.
    //
    // THE WHEEL ZOOMS, exactly like the field one keystroke away — about
    // the cursor, so what you point at stays put. A pinch's ctrl-tagged
    // events carry tiny deltas, so it takes the game's own stronger
    // factor; deltaMode 1 is a line-scrolling mouse (Firefox), whose
    // deltas are in lines rather than px
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const r = view.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const k = e.ctrlKey || e.metaKey ? 0.01 : 0.0015;
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-dy * k));
    };
    view.addEventListener("wheel", onWheel, { passive: false });

    const keyOf = (e: KeyboardEvent): string =>
      e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // browser shortcuts stay theirs
      const k = keyOf(e);
      if (PAN_KEYS[k]) {
        keysDown.current.add(k);
        e.preventDefault(); // arrows would otherwise walk the focus/page
      } else if (k === "+" || k === "=") zoomCenter(1.25);
      else if (k === "-" || k === "_") zoomCenter(0.8);
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      keysDown.current.delete(keyOf(e));
    };
    // missed keyups (cmd+tab away mid-pan) must not leave the camera drifting
    const onBlur = (): void => keysDown.current.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    // held-key panning runs on its own rAF clock so the speed is per
    // second, not per keydown repeat
    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let dx = 0, dy = 0;
      for (const k of keysDown.current) {
        const v = PAN_KEYS[k];
        if (v) {
          dx += v[0];
          dy += v[1];
        }
      }
      if (dx !== 0 || dy !== 0) {
        const c = cam.current;
        c.x += (dx * PAN_SPEED * dt) / c.z;
        c.y += (dy * PAN_SPEED * dt) / c.z;
        applyCam();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // drags are tracked on the window so one that leaves the viewport (or a
    // node button) keeps panning until the button comes up
    const onMove = (e: PointerEvent): void => {
      const pts = pointers.current;
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      if (pts.size >= 2) {
        // pinch: zoom by the distance ratio about the midpoint, and pan by
        // the midpoint's own travel — one gesture does both, like the field
        const other = [...pts.entries()].find(([id]) => id !== e.pointerId)?.[1];
        if (other) {
          const r = view.getBoundingClientRect();
          const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
          const d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
          const mx = (e.clientX + other.x) / 2 - r.left;
          const my = (e.clientY + other.y) / 2 - r.top;
          if (d0 > 1) zoomAt(mx, my, d1 / d0);
          const c = cam.current;
          c.x -= (e.clientX - prev.x) / 2 / c.z;
          c.y -= (e.clientY - prev.y) / 2 / c.z;
          applyCam();
        }
        dragPx.current = 1000; // a pinch is never a tap
      } else {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        dragPx.current += Math.abs(dx) + Math.abs(dy);
        if (dragPx.current > DRAG_PX) {
          const c = cam.current;
          c.x -= dx / c.z;
          c.y -= dy / c.z;
          applyCam();
        }
      }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent): void => {
      pointers.current.delete(e.pointerId);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const onResize = (): void => applyCam();
    window.addEventListener("resize", onResize);
    return () => {
      view.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [applyCam, zoomAt, zoomCenter]);

  // a node is drawn only once its parent holds a point; edges follow the
  // same rule, so buying a node is what reveals the links out of it.
  //
  // THE UPGRADE NODES ARE NOT ON THE BOARD. They share their turret's cell
  // (see TechNodeDef.x) and are drawn as the chip row hanging off it, so
  // laying them out here would stack every branch on its turret's one cell
  // and draw a zero-length edge under each.
  const visible = TECH_TREE.filter(
    (n) => !isUpgradeNode(n.id) && nodeStatus(progress, n.id) !== "hidden",
  );
  const chromeBtn =
    "pointer-events-auto rounded border border-[#2E2E36] bg-[#151518]/90 backdrop-blur px-3 py-1.5 text-[13px] uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]";

  return (
    <div
      ref={viewRef}
      className="fixed inset-0 touch-none select-none overflow-hidden bg-[#101013]"
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        // a fresh gesture starts its tap-vs-drag budget over — BEFORE the
        // chrome check, or a click after a drag would still read as one
        if (pointers.current.size === 0) dragPx.current = 0;
        // the floating chrome is UI, not map: its buttons never drag the board
        if ((e.target as Element).closest("[data-ui]")) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }}
      onClickCapture={(e) => {
        // a drag that happened to start on a node must not spend on it
        if (dragPx.current > DRAG_PX) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {/* NO will-change here, deliberately: promoting the layer makes the
          browser rasterize it once and stretch that texture as you zoom,
          which is exactly "why is the text blurry". Un-promoted, every
          transform change re-rasterizes at the live scale, and a board
          this small re-rasters well inside a frame */}
      <div
        ref={boardRef}
        className="absolute left-0 top-0"
        style={{
          width: BOARD_W,
          height: BOARD_H,
          transformOrigin: "0 0",
          // re-renders (buying a point) re-apply the ref's own transform,
          // so React and the imperative pan can never disagree
          transform: camCss(),
        }}
      >
        <svg
          className="absolute inset-0"
          width={BOARD_W}
          height={BOARD_H}
          aria-hidden="true"
        >
              {visible.map((n) => {
                if (!n.requires) return null;
                const parent = techNode(n.requires);
                const bought = (progress.tech[n.id] ?? 0) > 0;
                return (
                  <line
                    key={`${n.requires}-${n.id}`}
                    x1={centerX(parent.x)}
                    y1={centerY(parent.y)}
                    x2={centerX(n.x)}
                    y2={centerY(n.y)}
                    stroke={bought ? "#FFD37F" : "#4A4A55"}
                    strokeWidth={2}
                    strokeDasharray={bought ? undefined : "6 4"}
                  />
                );
              })}
            </svg>
            {visible.map((n) => {
              const status: NodeStatus = nodeStatus(progress, n.id);
              const points = progress.tech[n.id] ?? 0;
              const name = nodeName(n.id);
              // a turret stacks capacity forever; a utility is a switch, and
              // once it is on the node has nothing left to sell.
              //
              // EVERY NODE ON THE GRID IS ONE OR THE OTHER AGAIN. The duo
              // branch used to be a third case here — a utility that
              // STACKED — and it and the sixteen branches that followed it
              // are chips now (UpgradeChip), which took the toggle and the
              // refund off this loop with them. Nothing left on the board
              // is refundable or switchable.
              const utility = !isTowerNode(n.id);
              const owned = points > 0;
              const cap = techCap(n.id);
              const switchy = utility && cap <= 1;
              const clickable = status === "buyable";
              // the step is a ceiling, not a promise: a "×100" the wallet
              // only half covers lands what it covers rather than refusing
              const willBuy = clickable ? stepCount(progress, n.id, step) : 0;
              // a mouse is always primed — its hover already did the asking
              const primed = !touch || armed === n.id;
              // on touch the card follows `armed`, not the pointer: iOS does
              // not reliably focus a <button> it was tapped on, so hanging the
              // card off focus-within alone would leave taps opening nothing
              const showCard = touch && armed === n.id;
              return (
                <div
                  key={n.id}
                  className="group absolute"
                  style={{
                    left: centerX(n.x) - NODE / 2,
                    top: centerY(n.y) - NODE / 2,
                    width: NODE,
                    height: NODE,
                  }}
                >
                  <button
                    aria-label={
                      clickable && !primed
                        ? `${name}: show details, tap again to act`
                        : switchy
                          ? owned
                            ? `${name}: owned`
                            : `Unlock ${name}`
                          : owned
                            ? `${name}: +${Math.max(1, willBuy)} placement capacity`
                            : `Unlock ${name}`
                    }
                    // aria-disabled rather than disabled: a node priced out
                    // of reach still has to be able to say so, and a disabled
                    // button takes no focus — which on a touchscreen, where
                    // there is no hover either, left its price card with no
                    // way at all to be opened
                    aria-disabled={!clickable}
                    onClick={() => {
                      // an unbuyable node still opens its card on touch —
                      // "why not" is the question it most needs to answer
                      if (touch && armed !== n.id) {
                        setArmed(n.id);
                        return;
                      }
                      if (!clickable) return;
                      if (buyTech(n.id, Math.max(1, willBuy))) onChanged();
                    }}
                    className={`relative flex h-full w-full items-center justify-center rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                      owned
                        ? "border-[#FFD37F] bg-[#222227]"
                        : status === "locked-tier"
                          ? "border-[#2E2E36] bg-[#151518] opacity-40"
                          : "border-[#4A4A55] bg-[#151518] hover:border-[#FFD37F]"
                    } ${clickable ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    <NodeIcon id={n.id} lit={owned} />
                    {/* the corner badge carries the one number that changes:
                        a turret's capacity. A utility has no number — it is
                        on or it is not — so it gets a tick instead */}
                    {owned &&
                      (switchy ? (
                        <svg
                          viewBox="0 0 12 12"
                          className="absolute -bottom-2 -right-2 h-5 w-5 rounded border border-[#FFD37F] bg-[#101013] fill-[#FFD37F] p-0.5"
                          aria-hidden="true"
                        >
                          <path d="M10 2.8 4.6 9.4 2 6.6l1-1 1.6 1.7L9 2z" />
                        </svg>
                      ) : (
                        <span className="absolute -bottom-2 -right-2 rounded border border-[#FFD37F] bg-[#101013] px-1.5 text-[13px] font-bold text-[#FFD37F]">
                          ×{points}
                        </span>
                      ))}
                    {status === "locked-tier" && (
                      <svg
                        viewBox="0 0 12 12"
                        className="absolute -bottom-2 -right-2 h-5 w-5 rounded border border-[#2E2E36] bg-[#101013] fill-[#A6A6AF] p-0.5"
                        aria-hidden="true"
                      >
                        <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5H9a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5zm1.2 0h2.6V3.8a1.3 1.3 0 0 0-2.6 0V5z" />
                      </svg>
                    )}
                  </button>
                  <div
                    className={`text-center text-[12px] font-bold uppercase tracking-widest ${
                      owned ? "text-[#EDEDEF]" : "text-[#71717C]"
                    }`}
                  >
                    {name}
                  </div>
                  {/* hover card: what this node does right now — opened by
                      resting on the node with a mouse, and by the first tap
                      with a finger */}
                  <div
                    className={`pointer-events-none absolute left-1/2 z-10 w-56 -translate-x-1/2 rounded border border-[#4A4A55] bg-[#151518] p-3 text-left shadow-lg ${
                      showCard ? "block" : "hidden group-hover:block group-focus-within:block"
                    } ${n.y === 0 ? "top-full mt-5" : "bottom-full mb-3"}`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold text-[#EDEDEF]">{name}</span>
                      <span className="text-[13px] text-[#A6A6AF]">
                        {switchy ? (owned ? "On" : "Locked") : `Capacity ${points}`}
                      </span>
                    </div>
                    <div className="mt-1 text-[14px] text-[#A6A6AF]">
                      {utility
                        ? UTILITY_INFO[n.id as keyof typeof UTILITY_INFO].blurb
                        : owned
                          ? `+${Math.max(1, willBuy)} ${name} placements (${points} → ${
                              points + Math.max(1, willBuy)
                            })`
                          : `Unlocks the ${name} turret with 1 placement`}
                    </div>
                    {status === "locked-tier" ? (
                      <div className="mt-2 text-[13px] font-bold uppercase tracking-widest text-[#FF8A8A]">
                        Clear{" "}
                        <span style={{ color: rungColor(techNode(n.id).requiresTier ?? 0) }}>
                          {rungLabel(techNode(n.id).requiresTier ?? 0)}
                        </span>{" "}
                        first
                      </div>
                    ) : status === "maxed" ? null : (
                      <div className="mt-2 border-t border-[#2E2E36] pt-2 text-[14px]">
                        {/* the full bundle: every currency this tier wants.
                            Passing the bank reddens exactly the stacks it
                            can't cover, which is the whole "why can't I buy
                            this" explanation — no prose needed. Only the NEXT
                            point's price is shown even on a ×100 click: it is
                            the number that decides whether the click lands */}
                        <CostRow cost={techPrice(n.id, points)} bank={progress.bank} />
                      </div>
                    )}
                    {/* the card is only open on touch because a tap opened
                        it, and on touch a tap is what spends — so say so */}
                    {showCard && clickable && (
                      <div className="mt-2 text-[13px] font-bold uppercase tracking-widest text-[#FFD37F]">
                        Tap again to buy
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* THE UPGRADE ROWS. A sibling of the node rather than a child
                of it, deliberately: the node's own card opens on
                group-hover, and a chip living inside that group would pop
                the turret's card every time a finger went near its own */}
            {visible.map((n) =>
              isTowerNode(n.id) && (progress.tech[n.id] ?? 0) > 0 ? (
                <UpgradeRow
                  key={`up-${n.id}`}
                  turret={n.id}
                  x={n.x}
                  y={n.y}
                  progress={progress}
                  step={step}
                  touch={touch}
                  armed={armed}
                  onArm={setArmed}
                  onChanged={onChanged}
                />
              ) : null,
            )}
      </div>

      {/* floating chrome: the board pans underneath it. The wrapper eats no
          pointer events; each control opts back in and carries data-ui so a
          drag starting on it never grabs the board */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-[max(1rem,var(--safe-t))] left-[max(1rem,var(--safe-l))]"
          data-ui
        >
          {/* the standardized back: icon only, big, top-left — the same
              button every other screen pins there */}
          <div className="flex items-center gap-2">
            <button
              aria-label={backLabel}
              title={backLabel}
              onClick={onBack}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded border border-[#2E2E36] bg-[#151518]/90 text-[#A6A6AF] backdrop-blur hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path d="M14.7 5.1 7.8 12l6.9 6.9 1.7-1.7L11.2 12l5.2-5.2z" />
              </svg>
            </button>
            {onRestart && (
              <button onClick={onRestart} className={`${chromeBtn} h-11 font-bold text-[#FFD37F] border-[#FFD37F] hover:bg-[#2B2B32]`}>
                Restart run
              </button>
            )}
            {/* THE CODEX, beside back rather than on the board: it is the
                one control on this page that spends nothing, and the whole
                reason mutators are not a branch is that a page where every
                click costs money is no place for a rule you cannot buy */}
            <button
              onClick={() => setCodex(true)}
              aria-haspopup="dialog"
              className={`${chromeBtn} flex h-11 items-center gap-2 font-bold`}
              style={{ color: MUT_LIT, borderColor: MUT_LIT }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d={MUT_GLYPH} />
              </svg>
              Mutators
            </button>
          </div>
        </div>
        <div
          role="group"
          aria-label="points per click"
          className="pointer-events-auto absolute top-[max(1rem,var(--safe-t))] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded border border-[#2E2E36] bg-[#151518]/90 px-3 py-1.5 backdrop-blur"
          data-ui
        >
          <span className="text-[12px] uppercase tracking-widest text-[#71717C]">
            Buy
          </span>
          {BUY_STEPS.map((s) => (
            <button
              key={String(s)}
              aria-pressed={step === s}
              onClick={() => setStep(s)}
              className={`rounded border px-3 py-1 text-[13px] font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                step === s
                  ? "border-[#FFD37F] bg-[#222227] text-[#FFD37F]"
                  : "border-[#2E2E36] bg-[#151518] text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF]"
              }`}
            >
              {stepLabel(s)}
            </button>
          ))}
        </div>
        <span
          className="pointer-events-auto absolute top-[max(1rem,var(--safe-t))] right-[max(1rem,var(--safe-r))] flex items-start rounded border border-[#2E2E36] bg-[#151518]/90 px-4 py-1.5 backdrop-blur"
          data-ui
        >
          <Wallet bank={progress.bank} vertical />
        </span>
        <div
          className="absolute bottom-[max(1rem,var(--safe-b))] right-[max(1rem,var(--safe-r))] flex flex-col gap-2"
          data-ui
        >
          <button
            aria-label="zoom in"
            onClick={() => zoomCenter(1.25)}
            className={`${chromeBtn} flex h-10 w-10 items-center justify-center p-0 text-[17px] font-bold`}
          >
            +
          </button>
          <button
            aria-label="zoom out"
            onClick={() => zoomCenter(0.8)}
            className={`${chromeBtn} flex h-10 w-10 items-center justify-center p-0 text-[17px] font-bold`}
          >
            −
          </button>
        </div>
        {codex && <MutationPanel onClose={() => setCodex(false)} />}
      </div>
    </div>
  );
}
