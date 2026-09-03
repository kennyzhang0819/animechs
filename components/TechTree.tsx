"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TOWERS, TOWER_DESC, targetingLine } from "@/game/constants";
import {
  buyTech,
  canRefund,
  levelOf,
  nodeStatus,
  pointsFree,
  refundTech,
  isTechOn,
  saveTechOn,
  techOffSet,
  type NodeStatus,
  type Progress,
} from "@/game/progress";
import {
  isToggleable,
  isTowerNode,
  isUpgradeNode,
  TECH_TREE,
  techNode,
  techPoints,
  upgradePointsOf,
  upgradedTower,
  UTILITY_INFO,
  type TechKind,
  type TechNodeDef,
} from "@/game/tech";
import {
  TURRET_UPGRADES,
  upgradeDef,
  MAX_RUNGS,
  ULTIMATE_TIER,
  type TurretUpgradeDef,
} from "@/game/upgrades";
import type { TowerKind } from "@/game/types";
import { cellOf, GRID, LAYOUT_IDS } from "@/game/layout";
import { LevelStrip, PointsAmount } from "./Items";
import { NodeFace, SURGE } from "./techIcons";
import Board, {
  BackButton,
  BoardTabs,
  CHROME_BTN,
  useTouchOnly,
  type Cam,
} from "./Board";
import MutationTree, { MUT_GLYPH, MUT_LIT } from "./MutationTree";

/** what a node is called — turret stats, the upgrade table, or UTILITY_INFO */
const nodeName = (id: TechKind): string =>
  isTowerNode(id)
    ? TOWERS[id].name
    : isUpgradeNode(id)
      ? upgradeDef(id).name
      : UTILITY_INFO[id].name;

/** a grid node's face, at the size the board draws them; every table it
 *  reads lives in techIcons.tsx, which the layout editor shares */
function NodeIcon({ id, lit }: { id: TechKind; lit: boolean }) {
  return (
    <NodeFace
      id={id}
      sprite="h-14 w-14"
      glyph="h-10 w-10"
      color={lit ? "#FFD37F" : "#71717C"}
      dim={!lit}
    />
  );
}

// board geometry: nodes are squares centered in grid cells; the SVG edge
// layer underneath connects cell centers.
const NODE = 88;
/** an upgrade rung's box — smaller than a turret's, because a rung is a
 *  step along a branch and the turret is where the branch starts */
const UP = 64;

/**
 * THE UPGRADE RUNGS ARE NODES ON THE BOARD, and the board is a skill tree
 * rather than a table.
 *
 * They were a strip of 38px chips tucked under the turret's name with
 * nothing joining them. A chip is a badge, not a node: it cannot say what
 * comes before it, so a player could not see that Overload sits BEHIND
 * Piercing rounds without opening both cards — and every other
 * relationship on this board is a line.
 *
 * A ROW UNDER THE TURRET WAS NOT THE ANSWER EITHER. Four boxes in a gutter
 * is still a table; it just has lines in it. What a skill tree does — Path
 * of Exile is the reference — is let a branch LEAVE its hub and travel, so
 * the shape of the board tells you where you are before you have read a
 * word. So a rung is a node on the same grid every turret is on, out in
 * the open board beside its turret, with an edge into it.
 */

/**
 * WHERE EVERY NODE SITS comes from game/layout.ts, which is one editable
 * grid over turrets, utilities and upgrade rungs alike — and which the
 * admin dashboard's Tech tree tab drags around and saves. Nothing about
 * the board's shape is decided in this file any more; all it does is size
 * itself to whatever the layout came back with.
 */

/** half a node's box — the turrets are the big ones */
const half = (id: string): number => (isUpgradeNode(id) ? UP / 2 : NODE / 2);
/** room for the name label under a turret, and daylight at the edges */
const MARGIN = 90;

/**
 * THE BOARD IS AS BIG AS WHAT IS ON IT, measured rather than declared: a
 * node dragged out to the left in the editor simply makes the board wider,
 * and the camera's fit-on-mount follows it. A cell count could not do that
 * — it would clip whatever was dragged past the last column.
 */
const px = (id: string): { x: number; y: number } => {
  const c = cellOf(id);
  return { x: c.x * GRID, y: c.y * GRID };
};
const IDS = LAYOUT_IDS as readonly string[];
const MIN_X = Math.min(...IDS.map((id) => px(id).x - half(id))) - MARGIN;
const MIN_Y = Math.min(...IDS.map((id) => px(id).y - half(id))) - MARGIN;
const BOARD_W = Math.max(...IDS.map((id) => px(id).x + half(id))) + MARGIN - MIN_X;
const BOARD_H = Math.max(...IDS.map((id) => px(id).y + half(id))) + MARGIN - MIN_Y;

/** where a node sits on the board */
const nodeX = (id: string): number => px(id).x - MIN_X;
const nodeY = (id: string): number => px(id).y - MIN_Y;

/**
 * The board's camera — pan, zoom, and every gesture that drives them —
 * lives in Board.tsx, which the mutator codex shares (see the note there).
 * All this file still decides is how big the layer is and what is on it.
 */

/**
 * WHY A NODE CANNOT BE BOUGHT, in the player's own words — the line the
 * card leads with when the click would do nothing. Only the level gate
 * gets a sentence: a node the save cannot yet afford already prints its
 * price in red, and the level strip in the corner says what is in hand.
 */
function whyNot(p: Progress, id: TechKind, status: NodeStatus): string | null {
  const def = techNode(id);
  if (status === "locked-level")
    return `Reach level ${def.requiresLevel} first (you are level ${levelOf(p)}).`;
  return null;
}

/**
 * THE REFUND BUTTON, on any owned node's card that can go: hands the node
 * back and its points with it (refundTech). It is a labelled button
 * rather than a second meaning for the node's own click, because a click
 * that used to buy and now sells would sooner or later be an accident. A
 * node still holding up a child simply does not offer it — the branch is
 * taken back from its tip, and the board's own edges say which tip.
 */
function RefundButton({
  progress,
  id,
  onChanged,
}: {
  progress: Progress;
  id: TechKind;
  onChanged: () => void;
}) {
  if (!canRefund(progress, id)) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (refundTech(id)) onChanged();
        }}
        className="ms-btn ms-btn-tint w-full px-2 py-1 text-[13px]"
        style={{ "--ms-tint": SURGE } as CSSProperties}
      >
        Refund
      </button>
      <div className="mt-1">
        <PointsAmount amount={techPoints(id)} />
      </div>
    </div>
  );
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
 *   not yet owned  ->  buy it, for its points
 *   owned          ->  SWITCH IT ON OR OFF
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
 * A RUNG WHOSE PARENT IS UNBOUGHT IS NOT DRAWN AT ALL — the same
 * hide-until-the-parent-is-bought rule every other node on this board
 * obeys, and this file used to make an exception to it.
 *
 * The exception was written when these were CHIPS: a strip of four badges
 * in a gutter under the turret's name, where drawing two and leaving a gap
 * read as a rendering fault rather than as a branch you had not reached.
 * They are nodes on a skill tree now, out in open board with edges into
 * them, and a branch that stops where you have stopped is exactly what a
 * skill tree is supposed to look like. So the shape of what a turret can
 * become is something a player UNCOVERS, one rung at a time, like
 * everything else here.
 */
function UpgradeChip({
  def,
  left,
  top,
  progress,
  touch,
  armed,
  onArm,
  onChanged,
}: {
  def: TurretUpgradeDef;
  /** the node's centre in board px — it places itself, like every other
   *  box on this board */
  left: number;
  top: number;
  progress: Progress;
  touch: boolean;
  armed: boolean;
  onArm: () => void;
  onChanged: () => void;
}) {
  const status: NodeStatus = nodeStatus(progress, def.id);
  const owned = status === "owned";
  const on = isTechOn(progress, def.id);
  const ultimate = def.tier >= ULTIMATE_TIER;
  const lit = owned && on;
  const cost = techPoints(def.id);
  // an owned rung has nothing left to sell, so its click is the switch
  const toggles = owned && isToggleable(def.id);
  const clickable = status === "buyable" || toggles;
  const showCard = touch && armed;
  const reason = whyNot(progress, def.id, status);

  const colour = lit && ultimate
      ? { line: SURGE, face: "#241F0C", ink: SURGE }
      : lit
        ? { line: "#FFD37F", face: "#222227", ink: "#FFD37F" }
        : owned
          ? { line: "#5A2A2A", face: "#171214", ink: "#71717C" }
          : { line: "#454545", face: "#0b0b0d", ink: "#71717C" };

  const face = (
    <NodeFace
      id={def.id}
      sprite={`h-8 w-8 ${lit ? "" : "opacity-70"}`}
      glyph="h-8 w-8"
      color={colour.ink}
      dim={!lit}
    />
  );

  return (
    <div
      className="group/chip absolute"
      style={{ left: left - UP / 2, top: top - UP / 2, width: UP, height: UP }}
    >
      <button
        type="button"
        aria-disabled={!clickable}
        aria-label={
          clickable && touch && !armed
              ? `${def.name}: show details, tap again to act`
              : toggles
                ? `${def.name}: ${on ? "on, activate to switch off" : "off, activate to switch on"}`
                : owned
                  ? `${def.name}: owned`
                  : `Unlock ${def.name} for ${cost} ${cost === 1 ? "point" : "points"}`
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
          if (buyTech(def.id)) onChanged();
        }}
        className={`group/face relative flex h-full w-full items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 ${
          clickable ? "cursor-pointer" : "cursor-not-allowed"
        }`}
        style={{ outlineColor: ultimate ? SURGE : "#FFD37F" }}
      >
        {ultimate ? (
          // THE HEXAGON. An ultimate is not a bigger version of the chips
          // beside it, so it is not the same shape as them either — and a
          // border cannot be clipped into a hexagon with CSS without losing
          // the border, so the outline is drawn as a polygon
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
            className={`absolute inset-0 border-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85)] ${
              // the reachable-but-unbought chips are the ones a player is
              // deciding between, and a dim square that lights under the
              // pointer is how they tell themselves apart from the ones
              // already bought
              !owned ? "group-hover/face:border-[#FFD37F]" : ""
            }`}
            style={{ borderColor: colour.line, background: colour.face }}
          />
        )}
        <span className="relative flex items-center justify-center">{face}</span>
        {/* the price, on a chip not yet bought: a one-point rung says
            nothing, a dearer one says how much. Owned chips are lit and
            need no number */}
        {!owned && cost > 1 && (
          <span
            className="absolute -bottom-2 -right-2 border-2 bg-[#0b0b0d] px-1.5 text-[12px] font-bold leading-tight"
            style={{ borderColor: colour.line, color: colour.ink }}
          >
            {cost}
          </span>
        )}
        {/* switched off: the node is still owned, so say so on the chip
            rather than only in a card nobody has opened */}
        {owned && !on && (
          <span className="absolute -top-2 -right-2 h-3 w-3 border-2 border-[#0b0b0d] bg-[#e55454]" />
        )}
      </button>
      {/* the card. UNLIKE EVERY OTHER CARD ON THIS BOARD IT TAKES CLICKS,
          because a bought ultimate has an action that cannot go on the chip
          (the refund). The gap to the chip is PADDING rather than margin so
          a mouse travelling up to press that button never crosses dead
          ground and closes the card under itself */}
      <div
        className={`absolute bottom-full left-1/2 z-20 w-64 pb-2 text-left ${
          showCard ? "block" : "hidden group-hover/chip:block group-focus-within/chip:block"
        }`}
        /* counter-scaled for the same reason as the node card above */
        style={{
          transform: "translateX(-50%) scale(var(--ms-inv, 1))",
          transformOrigin: "bottom center",
        }}
      >
        <div className="ms-pane-solid p-3 shadow-lg">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-bold text-[#EDEDEF]">{def.name}</span>
            <span className="shrink-0 text-[13px] text-[#A6A6AF]">
              {owned ? (on ? "On" : "Off") : "Not bought"}
            </span>
          </div>
          {/* WHAT IT DOES, AND NOTHING ABOUT WHERE IT SITS: the chip is
              already drawn on its turret's own chain, in order */}
          <div className="mt-1 text-[14px] text-[#A6A6AF]">{def.blurb}</div>
          {owned && !on && (
            <div className="mt-2 text-[14px] font-bold text-[#FF8A8A]">
              Switched off — it is still yours, it is just not in play.
            </div>
          )}
          {owned ? (
            <div className="mt-2 space-y-2 border-t-2 border-[#454545] pt-2">
              {toggles && (
                <div className="text-[13px] font-bold uppercase tracking-widest" style={{ color: on ? "#7BE58A" : "#FF8A8A" }}>
                  {touch ? "Tap again" : "Click"} to switch {on ? "off" : "on"}
                </div>
              )}
              <RefundButton progress={progress} id={def.id} onChanged={onChanged} />
            </div>
          ) : (
            <div className="mt-2 border-t-2 border-[#454545] pt-2 text-[14px]">
              <PointsAmount amount={cost} short={status === "poor"} />
              {reason && (
                <div className="mt-1 text-[13px] text-[#FF8A8A]">{reason}</div>
              )}
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

/**
 * The rungs of a turret's branch that the board may draw: every one up to
 * and including the first that has not been bought. See UpgradeRow.
 */
function shownRungs(p: Progress, turret: TowerKind): TurretUpgradeDef[] {
  const rungs = TURRET_UPGRADES[turret];
  const out: TurretUpgradeDef[] = [];
  for (const def of rungs) {
    if (nodeStatus(p, def.id) === "hidden") break;
    out.push(def);
  }
  return out;
}

/**
 * THE CHAIN UNDER ONE TURRET, in tier order, AS FAR AS IT HAS BEEN BOUGHT.
 *
 * IT STOPS AT THE FIRST RUNG NOBODY HAS PAID FOR. Every node on this board
 * is drawn only once its parent holds a point (nodeStatus, "hidden"), and a
 * rung's parent is the rung before it — so a branch reaches exactly one
 * step past the deepest thing you own, and no further. That one step is the
 * frontier: it is what you may buy next, and it is the only thing about a
 * turret's future the board is willing to tell you.
 *
 * `visible` is a PREFIX, and taking it with a for-loop rather than a filter
 * is the point: a save cannot hold rung 3 without rung 2, so the first
 * hidden rung ends the branch, and a filter that kept a later one would
 * draw a node with no edge into it.
 *
 * A sibling of the turret's own node rather than a child of it,
 * deliberately: the turret's card opens on group-hover, and a rung living
 * inside that group would pop the turret's card every time a pointer went
 * near its own.
 */
function UpgradeRow({
  turret,
  x,
  y,
  progress,
  touch,
  armed,
  onArm,
  onChanged,
}: {
  turret: TowerKind;
  x: number;
  y: number;
  progress: Progress;
  touch: boolean;
  armed: string | null;
  onArm: (id: TechKind) => void;
  onChanged: () => void;
}) {
  return (
    <>
      {shownRungs(progress, turret).map((def) => (
        <UpgradeChip
          key={def.id}
          def={def}
          left={nodeX(def.id)}
          top={nodeY(def.id)}
          progress={progress}
          touch={touch}
          armed={armed === def.id}
          onArm={() => onArm(def.id)}
          onChanged={onChanged}
        />
      ))}
    </>
  );
}

/**
 * THE EDGES INTO A TURRET'S CHAIN: one down from the turret's own box into
 * rung 1, then one along between each pair of rungs.
 *
 * They follow the board's own rule — a lit edge means the far end is
 * BOUGHT, a dashed grey one means it is not — so the chain says at a
 * glance how far down it a player has actually got, which is the whole
 * thing a strip of unconnected chips could never say.
 */
function UpgradeEdges({
  turret,
  x,
  y,
  progress,
}: {
  turret: TowerKind;
  x: number;
  y: number;
  progress: Progress;
}) {
  const rungs = TURRET_UPGRADES[turret];
  return (
    <>
      {shownRungs(progress, turret).map((def, i) => {
        const bought = (progress.tech[def.id] ?? 0) > 0;
        return (
          <line
            key={def.id}
            x1={nodeX(i === 0 ? turret : rungs[i - 1].id)}
            y1={nodeY(i === 0 ? turret : rungs[i - 1].id)}
            x2={nodeX(def.id)}
            y2={nodeY(def.id)}
            stroke={bought ? "#FFD37F" : "#4A4A55"}
            strokeWidth={2}
            strokeDasharray={bought ? undefined : "6 4"}
          />
        );
      })}
    </>
  );
}

/**
 * THE TWO BOARDS THIS SCREEN IS. The tree is what you own; the codex is
 * what can be done to you. They are tabs rather than two entries in the
 * menu because the answer to "is this upgrade worth it" is on the other
 * one, and a player comparing them should not have to go back out to the
 * map list to do it.
 *
 * A crown for the tree — the thing at the top of everything you buy — and
 * the codex's own climbing chevrons for the mutators.
 */
const TREE_GLYPH = "M3 19h18v2H3zM3 6l5 4 4-7 4 7 5-4-2 11H5z";
const TABS = [
  { id: "tech", label: "Tech", color: "#FFD37F", glyph: TREE_GLYPH },
  { id: "mutators", label: "Mutators", color: MUT_LIT, glyph: MUT_GLYPH },
] as const;
type TabId = (typeof TABS)[number]["id"];

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
  const touch = useTouchOnly();
  // the one node a finger has already asked about, and so the one node a tap
  // is allowed to spend on. Tapping a different node moves the question there
  // rather than buying it
  const [armed, setArmed] = useState<string | null>(null);
  /**
   * THE TWO BOARDS BEHIND ONE BACK BUTTON — which one is showing, and the
   * camera each of them left behind.
   *
   * The mutator codex used to be a modal over this board; it is a board of
   * its own now (see MutationTree). A tab switch UNMOUNTS the one you were
   * on, so the cameras are kept up here, where they outlive both, and the
   * tree you had panned to the arc branch is still there when you come
   * back from reading what Speedy does.
   */
  const [tab, setTab] = useState<TabId>("tech");
  const treeCam = useRef<Cam | null>(null);
  const codexCam = useRef<Cam | null>(null);
  const tabStrip = <BoardTabs tabs={TABS} active={tab} onPick={setTab} />;

  if (tab === "mutators")
    return (
      <MutationTree
        onBack={onBack}
        backLabel={backLabel}
        tabs={tabStrip}
        cam={codexCam}
      />
    );

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

  /**
   * The floating chrome. Board's wrapper eats no pointer events; each
   * control opts back in (CHROME_BTN does) and carries `data-ui`, so a drag
   * that starts on a button grabs the button rather than the board.
   */
  const chrome = (
    <>
      <div
        className="absolute top-[max(1rem,var(--safe-t))] left-[max(1rem,var(--safe-l))] flex flex-wrap items-center gap-2"
        data-ui
      >
        <BackButton label={backLabel} onClick={onBack} />
        {onRestart && (
          <button
            onClick={onRestart}
            className={`${CHROME_BTN} h-11 font-bold text-[#FFD37F] border-[#FFD37F] hover:bg-[#2B2B32]`}
          >
            Restart run
          </button>
        )}
        {tabStrip}
      </div>
      {/* THE LEVEL STRIP: what the save is, and what it has to spend.
          Top-right, where the wallet used to hang — the one always-on
          reference on this board, and the answer to every "why can't I"
          a dim node asks */}
      <span
        className="pointer-events-auto ms-pane absolute top-[max(1rem,var(--safe-t))] right-[max(1rem,var(--safe-r))] flex items-start px-4 py-1.5"
        data-ui
      >
        <LevelStrip xp={progress.xp} points={pointsFree(progress)} />
      </span>
    </>
  );

  return (
    <Board width={BOARD_W} height={BOARD_H} cam={treeCam} chrome={chrome}>
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
                    x1={nodeX(parent.id)}
                    y1={nodeY(parent.id)}
                    x2={nodeX(n.id)}
                    y2={nodeY(n.id)}
                    stroke={bought ? "#FFD37F" : "#4A4A55"}
                    strokeWidth={2}
                    strokeDasharray={bought ? undefined : "6 4"}
                  />
                );
              })}
              {/* the chains, in the same layer so every edge on this board
                  is drawn under every box on it */}
              {visible.map((n) =>
                isTowerNode(n.id) && (progress.tech[n.id] ?? 0) > 0 ? (
                  <UpgradeEdges
                    key={`ue-${n.id}`}
                    turret={n.id}
                    x={n.x}
                    y={n.y}
                    progress={progress}
                  />
                ) : null,
              )}
            </svg>
            {visible.map((n) => {
              const status: NodeStatus = nodeStatus(progress, n.id);
              const name = nodeName(n.id);
              const utility = !isTowerNode(n.id);
              const owned = status === "owned";
              const cost = techPoints(n.id);
              const clickable = status === "buyable";
              const reason = whyNot(progress, n.id, status);
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
                    left: nodeX(n.id) - NODE / 2,
                    top: nodeY(n.id) - NODE / 2,
                    width: NODE,
                    height: NODE,
                  }}
                >
                  <button
                    aria-label={
                      clickable && !primed
                        ? `${name}: show details, tap again to act`
                        : owned
                          ? `${name}: owned`
                          : `Unlock ${name} for ${cost} ${cost === 1 ? "point" : "points"}`
                    }
                    // aria-disabled rather than disabled: a node out of reach
                    // still has to be able to say so, and a disabled button
                    // takes no focus — which on a touchscreen, where there is
                    // no hover either, left its card with no way to be opened
                    aria-disabled={!clickable}
                    onClick={() => {
                      // an unbuyable node still opens its card on touch —
                      // "why not" is the question it most needs to answer
                      if (touch && armed !== n.id) {
                        setArmed(n.id);
                        return;
                      }
                      if (!clickable) return;
                      if (buyTech(n.id)) onChanged();
                    }}
                    className={`relative flex h-full w-full items-center justify-center border-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.85)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                      owned
                        ? "border-[#FFD37F] bg-[#2a2416]"
                        : status === "locked-level"
                          ? "border-[#252525] bg-[#0b0b0d] opacity-40"
                          : "border-[#454545] bg-[#0b0b0d] hover:border-[#FFD37F]"
                    } ${clickable ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    <NodeIcon id={n.id} lit={owned} />
                    {/* the corner badge: a tick on an owned node, a lock on
                        one waiting for a level. A node is on or it is not —
                        there is no count to carry any more */}
                    {owned && (
                      <svg
                        viewBox="0 0 12 12"
                        className="absolute -bottom-2 -right-2 h-5 w-5 border-2 border-[#FFD37F] bg-[#0b0b0d] fill-[#FFD37F] p-0.5"
                        aria-hidden="true"
                      >
                        <path d="M10 2.8 4.6 9.4 2 6.6l1-1 1.6 1.7L9 2z" />
                      </svg>
                    )}
                    {status === "locked-level" && (
                      <svg
                        viewBox="0 0 12 12"
                        className="absolute -bottom-2 -right-2 h-5 w-5 border-2 border-[#454545] bg-[#0b0b0d] fill-[#A6A6AF] p-0.5"
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
                  {/* hover card: what this node does — opened by resting on
                      the node with a mouse, and by the first tap with a
                      finger. IT TAKES CLICKS, like the chip card, because an
                      owned node carries its refund button; the gap to the
                      node is padding rather than margin so a mouse crossing
                      it never closes the card under itself */}
                  <div
                    className={`absolute left-1/2 z-10 w-56 text-left ${
                      showCard ? "block" : "hidden group-hover:block group-focus-within:block"
                    } ${n.y === 0 ? "top-full pt-5" : "bottom-full pb-3"}`}
                    /* COUNTER-SCALED, so the card is the same size on screen
                       at every zoom. It has to live inside the board's scaled
                       layer to stay anchored to its node, and at the zoom
                       floor that layer is at 0.2 — a card that scaled with it
                       painted its 15px text at 3px. The origin is the edge
                       touching the node, so the card grows away from it */
                    style={{
                      transform: "translateX(-50%) scale(var(--ms-inv, 1))",
                      transformOrigin: n.y === 0 ? "top center" : "bottom center",
                    }}
                  >
                  <div className="ms-pane-solid p-3 shadow-lg">
                    <div className="flex items-baseline justify-between">
                      <span className="font-bold text-[#EDEDEF]">{name}</span>
                      <span className="text-[13px] text-[#A6A6AF]">
                        {owned ? "Owned" : "Locked"}
                      </span>
                    </div>
                    <div className="mt-1 text-[14px] text-[#A6A6AF]">
                      {utility
                        ? UTILITY_INFO[n.id as keyof typeof UTILITY_INFO].blurb
                        : owned
                          ? `The ${name} rides the build bar. Every one placed costs scrap in the run.`
                          : `Unlocks the ${name} turret for every run.`}
                    </div>
                    {/* WHAT THE GUN ACTUALLY DOES, on a turret node only —
                        how it delivers damage, then who it will shoot at.
                        THE TARGETING LINE IS RESOLVED AGAINST THE PLAYER'S
                        OWN UPGRADES, so arc reads "ground and air" the
                        moment Ionised Air is bought */}
                    {isTowerNode(n.id) && (
                      <>
                        <div className="mt-2 text-[13px] leading-snug text-[#A6A6AF]">
                          {TOWER_DESC[n.id]}
                        </div>
                        <div className="mt-1.5 text-[12px] font-bold uppercase tracking-wide text-[#71717C]">
                          {targetingLine(
                            upgradedTower(n.id, upgradePointsOf(n.id, progress.tech, techOffSet(progress)), {
                              count: 0,
                            }),
                          )}
                        </div>
                      </>
                    )}
                    {!owned && (
                      <div className="mt-2 border-t-2 border-[#454545] pt-2 text-[14px]">
                        <PointsAmount amount={cost} short={status === "poor"} />
                        {reason && (
                          <div className="mt-1 text-[13px] text-[#FF8A8A]">{reason}</div>
                        )}
                      </div>
                    )}
                    {owned && canRefund(progress, n.id) && (
                      <div className="mt-2 border-t-2 border-[#454545] pt-2 text-[14px]">
                        <RefundButton progress={progress} id={n.id} onChanged={onChanged} />
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
                </div>
              );
            })}
            {/* THE UPGRADE CHAINS — see the note over UpgradeRow */}
            {visible.map((n) =>
              isTowerNode(n.id) && (progress.tech[n.id] ?? 0) > 0 ? (
                <UpgradeRow
                  key={`up-${n.id}`}
                  turret={n.id}
                  x={n.x}
                  y={n.y}
                  progress={progress}
                  touch={touch}
                  armed={armed}
                  onArm={setArmed}
                  onChanged={onChanged}
                />
              ) : null,
            )}
    </Board>
  );
}
