import { POINT_COLOR } from "@/game/economy";
import {
  buySkill,
  refundAllSkills,
  refundSkill,
  skillPointsLeft,
  skillPointsOf,
  type Progress,
} from "@/game/progress";
import {
  MAX_RANKS,
  ranksOn,
  SKILL_NODES,
  spentSkillPoints,
  type SkillNode,
} from "@/game/skills";
import { HoverCard, useHoverCard } from "./HoverCard";
import { tile } from "./tile";

/**
 * THE SKILL TREE, as a board: one ROW a dial, twenty pips beside it,
 * filled left to right. Left click buys a rank, right click hands one
 * back, shift buys or refunds five.
 *
 * EVERY DIAL IS GLOBAL. There is no turret on this screen and no order to
 * buy in: a rank of Payload is a rank every gun on every board gets, so
 * what the player is deciding is what their whole line is FOR, not which
 * of twenty-three guns to bet on.
 *
 * Everything it can say about cost and headroom is asked of progress.ts
 * (buySkill, refundSkill), so the board never decides what is affordable —
 * a buy it cannot pay for in full simply takes what is left, which is why
 * nothing here ever has to explain a price.
 */

const ROW_COLOR = "#6E7A8C";

function Pip({
  on,
  next,
  onBuy,
  onRefund,
}: {
  on: boolean;
  next: boolean;
  onBuy: (e: React.MouseEvent) => void;
  onRefund: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onBuy}
      onContextMenu={(e) => {
        e.preventDefault();
        onRefund(e);
      }}
      className={`h-6 w-3.5 shrink-0 rounded-[2px] ${on ? "" : next ? "opacity-70" : "opacity-30"}`}
      style={{ background: on ? POINT_COLOR : "#3A3A44" }}
      aria-hidden
      tabIndex={-1}
    />
  );
}

function Row({
  node,
  ranks,
  onBuy,
  onRefund,
}: {
  node: SkillNode;
  ranks: number;
  onBuy: (id: string, n: number) => void;
  onRefund: (id: string, n: number) => void;
}) {
  const tip = useHoverCard("auto");
  const step = (e: React.MouseEvent) => (e.shiftKey ? 5 : 1);
  return (
    <>
      <div
        ref={tip.ref as React.RefObject<HTMLDivElement>}
        {...tip.anchorProps}
        className="ms-pane flex items-center gap-3 px-3 py-2"
      >
        <button
          onClick={(e) => onBuy(node.id, step(e))}
          onContextMenu={(e) => {
            e.preventDefault();
            onRefund(node.id, step(e));
          }}
          aria-label={`${node.name}: ${node.blurb(Math.max(1, ranks))}`}
          className="ms-tile flex h-9 w-9 shrink-0 items-center justify-center text-[10px] font-bold tracking-wide"
          style={{ ...tile(ROW_COLOR), color: ranks > 0 ? POINT_COLOR : "#9A9AA4" }}
        >
          {node.tag}
        </button>
        <span className="w-40 shrink-0 min-w-0">
          <span className="block truncate text-[14px] font-bold">{node.name}</span>
          <span
            className="block text-[12px]"
            style={{ color: ranks > 0 ? POINT_COLOR : "#71717C" }}
          >
            {ranks} / {MAX_RANKS}
          </span>
        </span>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: MAX_RANKS }, (_, i) => (
            <Pip
              key={i}
              on={i < ranks}
              next={i === ranks}
              onBuy={() => onBuy(node.id, i + 1 - ranks)}
              onRefund={() => onRefund(node.id, ranks - i)}
            />
          ))}
        </div>
      </div>
      <HoverCard
        tip={tip}
        title={node.name}
        tag={`${ranks} of ${MAX_RANKS} · 1 point a rank`}
        color={ROW_COLOR}
      >
        {node.blurb(Math.max(1, ranks))}
      </HoverCard>
    </>
  );
}

export default function SkillTree({
  progress,
  onProgress,
}: {
  progress: Progress;
  onProgress: (p: Progress) => void;
}) {
  const total = skillPointsOf(progress);
  const left = skillPointsLeft(progress);

  const buy = (id: string, n: number) => {
    if (n > 0) onProgress(buySkill(id, n));
  };
  const refund = (id: string, n: number) => {
    if (n > 0) onProgress(refundSkill(id, n));
  };

  return (
    <div className="ui-zoom mx-auto flex w-full max-w-4xl flex-1 flex-col gap-1.5 overflow-y-auto px-4 pt-[6.5rem] pb-12">
      <div className="flex items-center justify-between gap-4 px-1 pb-1">
        <span className="text-[15px]">
          <span className="font-display text-xl font-bold" style={{ color: POINT_COLOR }}>
            {left}
          </span>
          <span className="text-[#A6A6AF]">
            {" "}
            of {total} points unspent — one a level to 100, one a rank, and every rank is on
            every turret
          </span>
        </span>
        <button
          onClick={() => onProgress(refundAllSkills())}
          disabled={spentSkillPoints(progress.skills) === 0}
          className="ms-btn px-3 py-1.5 text-[14px] disabled:opacity-40"
        >
          Refund all
        </button>
      </div>
      {SKILL_NODES.map((node) => (
        <Row
          key={node.id}
          node={node}
          ranks={ranksOn(progress.skills, node.id)}
          onBuy={buy}
          onRefund={refund}
        />
      ))}
      <div className="px-1 pt-1 text-[13px] text-[#71717C]">
        Click a pip or the chip to buy, right click to hand one back — hold shift for five.
      </div>
    </div>
  );
}
