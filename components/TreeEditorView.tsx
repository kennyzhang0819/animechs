"use client";

import { useCallback, useRef, useState } from "react";
import { TOWERS } from "@/game/constants";
import {
  allLayoutOverrides,
  authoredCell,
  cellOf,
  GRID,
  isMoved,
  LAYOUT_IDS,
  saveLayoutDoc,
  setCell,
} from "@/game/layout";
import {
  isTowerNode,
  isUpgradeNode,
  techNode,
  UTILITY_INFO,
  type TechKind,
} from "@/game/tech";
import { upgradeDef } from "@/game/upgrades";
import Board, { BackButton, CHROME_BTN, type Cam } from "./Board";

/**
 * THE TECH-TREE LAYOUT EDITOR — drag a node, drop it on a cell.
 *
 * WHY THIS EXISTS. Laying out a skill tree is composition, not arithmetic:
 * which way a branch leaves its hub, how much air a wing needs, where the
 * eye lands. None of that can be written as coordinates in a source file
 * and got right on the second try — it is got right by moving a node and
 * looking at what happened. So the cells live in a document
 * (public/tree.json, see game/layout.ts) and this is the thing that
 * writes it.
 *
 * IT IS THE REAL BOARD, not a diagram of it. Same camera, same grid, same
 * edges, the same boxes at the same sizes — because a layout that reads
 * well in a schematic and badly in the game is exactly the failure this
 * tool is meant to prevent. What it adds is the grid itself, drawn, and
 * the drag.
 *
 * EVERY NODE IS SHOWN, bought or not, locked or not. The player's board
 * hides a branch until its parent is paid for; a layout has to be composed
 * against everything that can ever appear on it.
 */

/** what a node is called — the same three sources the player's board reads */
const nameOf = (id: TechKind): string =>
  isTowerNode(id)
    ? TOWERS[id].name
    : isUpgradeNode(id)
      ? upgradeDef(id).name
      : UTILITY_INFO[id].name;

/** turret and utility boxes are the big ones; a rung is a step along a
 *  branch, and smaller — the same two sizes the player's board draws */
const NODE = 88;
const UP = 64;
const sizeOf = (id: TechKind): number => (isUpgradeNode(id) ? UP : NODE);

/** the colour a node wears here: gold for the turrets and utilities that
 *  make up the trunk, pink for the rungs hanging off them, so a wing's
 *  shape is readable at the zoom you actually compose at */
const TRUNK = "#FFD37F";
const RUNG = "#FF8ACB";
const inkOf = (id: TechKind): string => (isUpgradeNode(id) ? RUNG : TRUNK);

/** how much empty board to keep around the outermost node, so there is
 *  always somewhere to drag one TO */
const MARGIN = GRID * 4;

export default function TreeEditorView({ onClose }: { onClose: () => void }) {
  // the layout lives in module state (layout.ts) like every other override
  // in this codebase, so the counter is the real dependency
  const [, bump] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState<TechKind | null>(null);
  const cam = useRef<Cam | null>(null);
  /** the pointer's last board-space position, and the cell the node was on
   *  when the drag started — a drag is applied as a delta so a node never
   *  jumps to sit under the cursor */
  const from = useRef({ px: 0, py: 0, cx: 0, cy: 0 });

  const ids = LAYOUT_IDS;
  const cells = ids.map((id) => cellOf(id));
  const xs = cells.map((c) => c.x * GRID);
  const ys = cells.map((c) => c.y * GRID);
  const minX = Math.min(...xs) - MARGIN;
  const minY = Math.min(...ys) - MARGIN;
  const width = Math.max(...xs) + MARGIN - minX;
  const height = Math.max(...ys) + MARGIN - minY;
  const at = (id: TechKind): { x: number; y: number } => {
    const c = cellOf(id);
    return { x: c.x * GRID - minX, y: c.y * GRID - minY };
  };

  const save = useCallback(async () => {
    setStatus((await saveLayoutDoc(allLayoutOverrides())) ? "Saved" : "Save failed");
  }, []);

  const resetAll = useCallback(() => {
    for (const id of LAYOUT_IDS) setCell(id, undefined);
    setStatus(null);
    bump((n) => n + 1);
  }, []);

  /**
   * THE DRAG. It is on the node rather than on the board because the board
   * under it is already listening for a drag of its own — that one pans the
   * camera — and `data-ui` on the wrapper is what tells it to keep its
   * hands off (see Board).
   *
   * The delta is divided by the camera's scale, so a node follows the
   * cursor exactly however far out you have zoomed, and it snaps to the
   * grid only on the way in: the cell is recomputed every move, so what you
   * see while dragging is where it will land.
   */
  const onDown = (id: TechKind) => (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const z = cam.current?.z ?? 1;
    const c = cellOf(id);
    from.current = { px: e.clientX / z, py: e.clientY / z, cx: c.x, cy: c.y };
    setDragging(id);
  };
  const onMove = (id: TechKind) => (e: React.PointerEvent) => {
    if (dragging !== id) return;
    const z = cam.current?.z ?? 1;
    const dx = e.clientX / z - from.current.px;
    const dy = e.clientY / z - from.current.py;
    setCell(id, {
      x: from.current.cx + Math.round(dx / GRID),
      y: from.current.cy + Math.round(dy / GRID),
    });
    setStatus(null);
    bump((n) => n + 1);
  };
  const onUp = () => setDragging(null);

  const moved = ids.filter((id) => isMoved(id)).length;

  return (
    <Board
      width={width}
      height={height}
      cam={cam}
      chrome={
        <>
          <div
            className="absolute top-[max(1rem,var(--safe-t))] left-[max(1rem,var(--safe-l))] flex flex-wrap items-center gap-2"
            data-ui
          >
            <BackButton label="Back to admin" onClick={onClose} />
            <button onClick={save} className={`${CHROME_BTN} h-11 font-bold text-[#EDEDEF]`}>
              Save
            </button>
            <button
              onClick={resetAll}
              disabled={moved === 0}
              className={`${CHROME_BTN} h-11 disabled:opacity-30`}
            >
              Reset all
            </button>
            <span className="rounded border border-[#2E2E36] bg-[#151518]/90 px-3 py-1.5 text-[13px] text-[#71717C] backdrop-blur">
              {moved} moved{status ? ` · ${status}` : ""}
            </span>
          </div>
          <div
            className="absolute bottom-[max(1rem,var(--safe-b))] left-1/2 max-w-[calc(100vw-10rem)] -translate-x-1/2 rounded border border-[#2E2E36] bg-[#151518]/90 px-3 py-1.5 text-[12.5px] leading-snug text-[#71717C] backdrop-blur"
            data-ui
          >
            Drag a node to move it; it snaps to the grid. Double-click one to send it back
            to its authored cell. Save writes public/tree.json, which the game reads over
            the authored layout at startup.
          </div>
        </>
      }
    >
      {/* the grid, drawn — you cannot compose against spacing you cannot
          see, and the edges below read very differently depending on
          whether a branch is one cell clear of a trunk or two */}
      <svg className="absolute inset-0" width={width} height={height} aria-hidden="true">
        <defs>
          <pattern
            id="tree-grid"
            width={GRID}
            height={GRID}
            patternUnits="userSpaceOnUse"
            // line the pattern up with the cells rather than with the
            // board's own corner, or the dots sit half a cell off every node
            x={-minX % GRID}
            y={-minY % GRID}
          >
            <circle cx={0} cy={0} r={1.5} fill="#2E2E36" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#tree-grid)" />
        {ids.map((id) => {
          const n = techNode(id);
          if (!n.requires) return null;
          const a = at(n.requires as TechKind);
          const b = at(id);
          return (
            <line
              key={`${n.requires}-${id}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={isUpgradeNode(id) ? "#5A3A4C" : "#4A4A55"}
              strokeWidth={2}
            />
          );
        })}
      </svg>

      {ids.map((id) => {
        const p = at(id);
        const s = sizeOf(id);
        const ink = inkOf(id);
        const on = dragging === id;
        return (
          <div
            key={id}
            // data-ui so the board underneath does not treat this drag as a pan
            data-ui
            onPointerDown={onDown(id)}
            onPointerMove={onMove(id)}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onDoubleClick={() => {
              setCell(id, undefined);
              setStatus(null);
              bump((n) => n + 1);
            }}
            title={`${nameOf(id)} — ${cellOf(id).x}, ${cellOf(id).y}${
              isMoved(id)
                ? ` (authored ${authoredCell(id).x}, ${authoredCell(id).y})`
                : ""
            }`}
            className={`absolute flex cursor-grab select-none flex-col items-center justify-center rounded-lg border-2 bg-[#151518] text-center active:cursor-grabbing ${
              on ? "z-10 shadow-lg" : ""
            }`}
            style={{
              left: p.x - s / 2,
              top: p.y - s / 2,
              width: s,
              height: s,
              borderColor: ink,
              opacity: on ? 0.85 : 1,
            }}
          >
            <span
              className="px-1 text-[11px] font-bold uppercase leading-tight tracking-wide"
              style={{ color: ink }}
            >
              {nameOf(id)}
            </span>
            {isMoved(id) && (
              <span className="absolute -top-1.5 -right-1.5 h-2.5 w-2.5 rounded-full border border-[#101013] bg-[#7BE58A]" />
            )}
          </div>
        );
      })}
    </Board>
  );
}
