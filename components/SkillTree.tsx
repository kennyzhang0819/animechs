import { useState } from "react";
import { POINT_COLOR } from "@/game/economy";
import {
  buySkill,
  refundAllSkills,
  refundSkill,
  skillPointsLeft,
  skillPointsOf,
  techOf,
  type Progress,
} from "@/game/progress";
import {
  RUNGS_PER_TURRET,
  rungsOn,
  SKILL_LINES,
  SKILL_TURRETS,
  spentSkillPoints,
  type SkillNode,
} from "@/game/skills";
import { TOWERS } from "@/game/constants";
import { rarityDef } from "@/game/rarity";
import type { TowerKind } from "@/game/types";
import { HoverCard, useHoverCard } from "./HoverCard";
import { useTowerIcon } from "./towerIcons";
import { tile } from "./tile";

/**
 * THE SKILL TREE, as a board: one ROW a turret, its ten nodes to the
 * right of it, bought left to right. Left click spends a point, right
 * click hands one back, and a row the track has not opened is shown shut
 * rather than hidden — the line is what the turret is FOR later.
 *
 * Everything it can say about cost, order and balance is asked of
 * progress.ts (buySkill, refundSkill), so the board never decides what is
 * affordable.
 */

function TurretFace({ kind }: { kind: TowerKind }) {
  const src = useTowerIcon(kind);
  return <img src={src} alt="" className="h-7 w-7 object-contain [image-rendering:pixelated]" />;
}

function Node({
  node,
  state,
  color,
  onBuy,
  onRefund,
}: {
  node: SkillNode;
  state: "bought" | "next" | "locked";
  color: string;
  onBuy: () => void;
  onRefund: () => void;
}) {
  const tip = useHoverCard("auto");
  const bought = state === "bought";
  return (
    <>
      <button
        ref={tip.ref as React.RefObject<HTMLButtonElement>}
        {...tip.anchorProps}
        onClick={onBuy}
        onContextMenu={(e) => {
          e.preventDefault();
          onRefund();
        }}
        aria-label={`${TOWERS[node.turret].name} ${node.rung}: ${node.name}. ${node.blurb}`}
        className={`ms-tile flex h-11 w-11 shrink-0 flex-col items-center justify-center leading-none ${
          bought ? "" : state === "next" ? "opacity-80" : "opacity-35"
        }`}
        style={tile(bought ? color : "#4A4A52")}
      >
        <span className="text-[10px] font-bold tracking-wide" style={{ color: bought ? POINT_COLOR : "#9A9AA4" }}>
          {node.tag}
        </span>
        <span className="text-[9px] text-[#8A8A94]">{node.rung}</span>
      </button>
      <HoverCard tip={tip} title={node.name} tag={`Rung ${node.rung} · 1 point`} color={color}>
        {node.blurb}
      </HoverCard>
    </>
  );
}

function Row({
  kind,
  bought,
  open,
  onBuy,
  onRefund,
}: {
  kind: TowerKind;
  bought: number;
  open: boolean;
  onBuy: (kind: TowerKind, rung: number) => void;
  onRefund: (kind: TowerKind, rung: number) => void;
}) {
  const color = rarityDef(kind).color;
  return (
    <div className={`ms-pane flex items-center gap-3 px-3 py-2 ${open ? "" : "border-[#252525]"}`}>
      <div className={`flex w-40 shrink-0 items-center gap-2 ${open ? "" : "opacity-45"}`}>
        <span className="ms-tile flex h-9 w-9 items-center justify-center" style={tile(color)}>
          <TurretFace kind={kind} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold">{TOWERS[kind].name}</span>
          <span className="block text-[12px]" style={{ color: bought > 0 ? POINT_COLOR : "#71717C" }}>
            {open ? `${bought} / ${RUNGS_PER_TURRET}` : "Locked"}
          </span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SKILL_LINES[kind].map((n) => (
          <Node
            key={n.id}
            node={n}
            color={color}
            state={n.rung <= bought ? "bought" : open && n.rung === bought + 1 ? "next" : "locked"}
            onBuy={() => open && onBuy(kind, n.rung)}
            onRefund={() => open && onRefund(kind, n.rung)}
          />
        ))}
      </div>
    </div>
  );
}

export default function SkillTree({
  progress,
  onProgress,
}: {
  progress: Progress;
  onProgress: (p: Progress) => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const total = skillPointsOf(progress);
  const left = skillPointsLeft(progress);
  const unlocked = techOf(progress).unlocked;

  // a node further up the line takes every rung under it with it, and a
  // refund hands back every rung above the one clicked — the chain is
  // never bought with a hole in it
  const buy = (kind: TowerKind, rung: number) => {
    const want = rung - rungsOn(progress.skills, kind);
    if (want <= 0) return;
    if (want > left) {
      setNote(`That needs ${want} points and you have ${left}.`);
      return;
    }
    setNote(null);
    onProgress(buySkill(kind, want));
  };
  const refund = (kind: TowerKind, rung: number) => {
    const back = rungsOn(progress.skills, kind) - rung + 1;
    if (back <= 0) return;
    setNote(null);
    onProgress(refundSkill(kind, back));
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
            of {total} points unspent — one a level to 100, one a node
          </span>
        </span>
        <button
          onClick={() => {
            setNote(null);
            onProgress(refundAllSkills());
          }}
          disabled={spentSkillPoints(progress.skills) === 0}
          className="ms-btn px-3 py-1.5 text-[14px] disabled:opacity-40"
        >
          Refund all
        </button>
      </div>
      {note && <div className="px-1 text-[13px] text-[#FF9A62]">{note}</div>}
      {SKILL_TURRETS.map((kind) => (
        <Row
          key={kind}
          kind={kind}
          bought={rungsOn(progress.skills, kind)}
          open={unlocked.has(kind)}
          onBuy={buy}
          onRefund={refund}
        />
      ))}
    </div>
  );
}
