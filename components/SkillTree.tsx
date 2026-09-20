import { POINT_COLOR } from "@/game/economy";
import {
  buySkill,
  refundAllSkills,
  refundSkill,
  skillPointsLeft,
  type Progress,
} from "@/game/progress";
import {
  bonusOn,
  ranksOn,
  SKILL_NODES,
  spentSkillPoints,
  type SkillNode,
} from "@/game/skills";
import { HoverCard, useHoverCard } from "./HoverCard";
import { CurrencyIcon } from "./Items";
import { MOD_GRID, modGlyph } from "./modArt";
import { tile } from "./tile";

/**
 * THE UPGRADES BOARD — four big buttons, one a dial. Left click raises it,
 * right click lowers it, shift moves five.
 *
 * THE ONE NUMBER IS THE POOL. A dial has no cap a player can reach
 * (skills.ts MAX_RANKS is a runaway guard), so a pip row or an "x of
 * twenty" would be drawing a bar that never fills; the points in hand are
 * the only ceiling there is, so they are printed once, big, at the top.
 * A button prints the bonus its dial is AT and nothing else.
 *
 * EVERY DIAL IS GLOBAL. There is no turret here and no order to buy in: a
 * rank of Attack Damage is a rank every gun on every board gets.
 */

const ROW_COLOR = "#6E7A8C";

/** the same 16-square drawing the mod for this stat wears (modArt.ts) */
function Glyph({ glyph }: { glyph: SkillNode["glyph"] }) {
  return (
    <svg
      viewBox={`0 0 ${MOD_GRID} ${MOD_GRID}`}
      className="h-10 w-10"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {modGlyph(glyph).map((layer) => (
        <path key={layer.color} fill={layer.color} d={layer.d} />
      ))}
    </svg>
  );
}

function Dial({
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
      <button
        ref={tip.ref as React.RefObject<HTMLButtonElement>}
        {...tip.anchorProps}
        onClick={(e) => onBuy(node.id, step(e))}
        onContextMenu={(e) => {
          e.preventDefault();
          onRefund(node.id, step(e));
        }}
        aria-label={`${node.name}: ${node.blurb(Math.max(1, ranks))}`}
        className="ms-pane flex flex-col items-center gap-2.5 px-4 py-5 text-center"
      >
        <span
          className="ms-tile flex h-14 w-14 items-center justify-center"
          style={tile(ROW_COLOR)}
        >
          <Glyph glyph={node.glyph} />
        </span>
        <span className="text-[14px] font-bold">{node.name}</span>
        <span
          className="font-display text-2xl font-bold leading-none"
          style={{ color: ranks > 0 ? POINT_COLOR : "#5A5A64" }}
        >
          {bonusOn(node, ranks)}
        </span>
      </button>
      <HoverCard tip={tip} title={node.name} tag={bonusOn(node, ranks)} color={ROW_COLOR}>
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
  const buy = (id: string, n: number) => {
    if (n > 0) onProgress(buySkill(id, n));
  };
  const refund = (id: string, n: number) => {
    if (n > 0) onProgress(refundSkill(id, n));
  };

  return (
    <div className="ui-zoom mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 overflow-y-auto px-4 pt-[6.5rem] pb-12">
      <div className="flex items-center justify-between gap-4 px-1">
        <span className="flex items-center gap-2 font-display text-2xl font-bold">
          <CurrencyIcon glyph="point" className="h-6 w-6" />
          <span className="text-[#A6A6AF]">Upgrade Points: </span>
          <span style={{ color: POINT_COLOR }}>{skillPointsLeft(progress)}</span>
        </span>
        <button
          onClick={() => onProgress(refundAllSkills())}
          disabled={spentSkillPoints(progress.skills) === 0}
          className="ms-btn px-3 py-1.5 text-[14px] disabled:opacity-40"
        >
          Refund all
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SKILL_NODES.map((node) => (
          <Dial
            key={node.id}
            node={node}
            ranks={ranksOn(progress.skills, node.id)}
            onBuy={buy}
            onRefund={refund}
          />
        ))}
      </div>
    </div>
  );
}
