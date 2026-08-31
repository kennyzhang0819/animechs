"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, TOWERS } from "@/game/constants";
import {
  activeMutations,
  affordablePoints,
  mutationRank,
  buyTech,
  nodeStatus,
  saveMutation,
  type NodeStatus,
  type Progress,
} from "@/game/progress";
import {
  isTowerNode,
  TECH_TREE,
  techNode,
  techPrice,
  UTILITY_INFO,
  type TechKind,
} from "@/game/tech";
import { MUTATIONS, type MutationDef } from "@/game/mutation";
import { difficultyColor, difficultyName } from "@/game/ladder";
import { CostRow, Wallet } from "./Items";
import { TOWER_ICONS } from "./towerIcons";

/** what a node is called — turret stats for the turrets, UTILITY_INFO for the rest */
const nodeName = (id: TechKind): string =>
  isTowerNode(id) ? TOWERS[id].name : UTILITY_INFO[id].name;

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
// a warning triangle with the bang punched out (even-odd fill) — the face
// of A Final Threat, drawn in Eradication's own purple once it is owned

/** utility nodes whose face is a block sprite rather than a glyph: world 2
 *  the projector node wears the block it is a reservation for */
const UTIL_ICONS: Partial<Record<TechKind, string>> = {
  "overdrive-projector": "/mindustry/sprites/blocks/defense/overdrive-projector.png",
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
      <path
        fillRule="evenodd"
        d={id === "slot-7" || id === "slot-8" ? SLOT_GLYPH : FF_GLYPH}
      />
    </svg>
  );
}

const HOME_ICON = "/mindustry/sprites/blocks/storage/core-shard.png";

/**
 * THE MUTATION COLUMN, laid out in the same grid the tech tree uses so the
 * two read as one board.
 *
 * IT HANGS OFF HOME, like everything else does. Home is the trunk the whole
 * board forks from — turrets down the middle, utilities off to the right,
 * the projector's reservation on the near left — and mutation is the far
 * left arm of the same junction. Drawing it unattached would have made it a
 * second, unrelated board that happened to share a viewport.
 *
 * IT SITS AT NEGATIVE X, which is why the geometry below no longer assumes
 * the board starts at zero. The distance from the trunk is the point:
 * nothing on this column is bought, and nothing on it makes the player
 * stronger, so it must not be mistaken for another branch of upgrades. Its
 * link to home is drawn in the column's own colour rather than the tree's
 * gold for the same reason.
 *
 * THE COLUMN IS A CHAIN, AND IT ENDS AT THE SAVE'S RANK: the marker at the
 * top and one switch per rank EARNED, in order. A rank that has not been
 * reached is not drawn at all — not greyed, not teased. That is the tree's
 * own rule (a node stays hidden until its parent holds a point) and it is
 * the right one twice over here: what the next mutation turns out to be is
 * the reward for felling the boss, and a locked row of them would advertise
 * how long the line is, which is a promise this list is in no position to
 * make.
 */
const MUT_X = -1;
/** the rank marker, and the row each mutation switch sits on */
const mutY = (level: number): number => level;
/** the column's own colour — deliberately NOT the tree's gold. Gold on this
 *  board means "bought, owned, yours"; mutation is none of those */
const MUT_LIT = "#FF8ACB";
/** the armed-node key for a mutation switch, in the same namespace the
 *  tree's own nodes use (see `armed`) */
const mutKey = (level: number): string => `asc-${level}`;

/** the armed key for the column's marker — it opens a card like a node,
 *  though tapping it a second time does nothing, because it does nothing */
const MUT_MARKER = "asc-marker";
/** three chevrons climbing — the rank marker's face */
const MUT_GLYPH = "M12 2 4 9h5v2H4l8 7 8-7h-5V9h5z";
/** a disc with a wedge bitten out of it — the hungry switch's maw */
const HUNGER_GLYPH = "M12 2a10 10 0 1 0 8.66 15L12 12l8.66-5A9.98 9.98 0 0 0 12 2z";

/**
 * ONE MUTATION SWITCH.
 *
 * It is a TOGGLE, not a purchase, and every part of it says so: no price
 * row, no capacity badge, no gold. It reads ON or OFF and flips on every
 * click — there is no locked state, because a switch this save has not
 * earned is not on the board at all (see the column note above).
 *
 * The touch rule is the tree's own (see useTouchOnly): with no hover to
 * read a node with, the first tap on a finger opens the card and the
 * second one acts. Toggling costs nothing, but a player who cannot see
 * what a switch DOES before flipping it is being asked to change the rules
 * of their game blind.
 */
function MutationNode({
  def,
  on,
  touch,
  armed,
  onArm,
  onToggle,
}: {
  def: MutationDef;
  on: boolean;
  touch: boolean;
  armed: boolean;
  onArm: () => void;
  onToggle: () => void;
}) {
  const showCard = touch && armed;
  return (
    <div
      className="group absolute"
      style={{
        left: centerX(MUT_X) - NODE / 2,
        top: centerY(mutY(def.level)) - NODE / 2,
        width: NODE,
        height: NODE,
      }}
    >
      <button
        aria-pressed={on}
        aria-label={`${def.name}: mutation ${def.level}, ${on ? "on" : "off"}`}
        onClick={() => {
          if (touch && !armed) {
            onArm();
            return;
          }
          onToggle();
        }}
        className={`relative flex h-full w-full cursor-pointer items-center justify-center rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF8ACB] ${
          on
            ? "border-[#FF8ACB] bg-[#2A1B24]"
            : "border-[#4A4A55] bg-[#151518] hover:border-[#FF8ACB]"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-10 w-10 ${on ? "fill-[#FF8ACB]" : "fill-[#71717C]"}`}
          aria-hidden="true"
        >
          <path fillRule="evenodd" d={def.level === 1 ? HUNGER_GLYPH : MUT_GLYPH} />
        </svg>
        {/* the badge is the switch's whole state, and the state is binary. A
            turret's badge counts what you own; there is nothing here to own */}
        <span
          className={`absolute -bottom-2 -right-2 rounded border px-1.5 text-[13px] font-bold ${
            on
              ? "border-[#FF8ACB] bg-[#101013] text-[#FF8ACB]"
              : "border-[#2E2E36] bg-[#101013] text-[#71717C]"
          }`}
        >
          {on ? "On" : "Off"}
        </span>
      </button>
      <div
        className={`text-center text-[12px] font-bold uppercase tracking-widest ${
          on ? "text-[#EDEDEF]" : "text-[#71717C]"
        }`}
      >
        {def.name}
      </div>
      <div
        className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 w-56 -translate-x-1/2 rounded border border-[#4A4A55] bg-[#151518] p-3 text-left shadow-lg ${
          showCard ? "block" : "hidden group-hover:block group-focus-within:block"
        }`}
      >
        <div className="flex items-baseline justify-between">
          <span className="font-bold text-[#EDEDEF]">{def.name}</span>
          <span className="text-[13px] text-[#A6A6AF]">Mutation {def.level}</span>
        </div>
        <div className="mt-1 text-[14px] text-[#A6A6AF]">{def.blurb}</div>
        <div className="mt-2 border-t border-[#2E2E36] pt-2 text-[13px] font-bold uppercase tracking-widest">
          <span style={{ color: on ? MUT_LIT : "#71717C" }}>
            {on ? "Playing with this" : "Not in play"}
          </span>
        </div>
        {showCard && (
          <div className="mt-2 text-[13px] font-bold uppercase tracking-widest text-[#FF8ACB]">
            Tap again to {on ? "switch off" : "switch on"}
          </div>
        )}
      </div>
    </div>
  );
}

// board geometry: nodes are squares centered in grid cells; the SVG edge
// layer underneath connects cell centers
const CELL_W = 160;
const CELL_H = 132;
const NODE = 88;
const ALL_X = [...TECH_TREE.map((n) => n.x), MUT_X];
const ALL_Y = [...TECH_TREE.map((n) => n.y), ...MUTATIONS.map((a) => mutY(a.level)), 0];
// the mutation column runs off the left of the tree's own grid, so board
// space is the node grid SHIFTED to start at zero rather than the grid
// itself — every reader goes through centerX, so this is the only place
// that has to know
const MIN_X = Math.min(...ALL_X);
const BOARD_W = (Math.max(...ALL_X) - MIN_X + 1) * CELL_W;
const BOARD_H = (Math.max(...ALL_Y) + 1) * CELL_H;

const centerX = (x: number): number => (x - MIN_X + 0.5) * CELL_W;
const centerY = (y: number): number => (y + 0.5) * CELL_H;

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
  backLabel = "◂ Levels",
}: {
  progress: Progress;
  /** a point was bought — the caller re-reads the save */
  onChanged: () => void;
  onBack: () => void;
  /** where leaving goes, in words. The tree is reachable from the menu AND
   * from a lost run, and those are different exits — one returns to the
   * level list, the other starts the run again with what was just bought */
  backLabel?: string;
}) {
  const [step, setStep] = useState<BuyStep>(1);
  const touch = useTouchOnly();
  // the one node a finger has already asked about, and so the one node a tap
  // is allowed to spend on. Tapping a different node moves the question there
  // rather than buying it
  const [armed, setArmed] = useState<string | null>(null);

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
  // same rule, so buying a node is what reveals the links out of it
  const visible = TECH_TREE.filter((n) => nodeStatus(progress, n.id) !== "hidden");
  // the left column's two facts: how far the save has climbed, and which of
  // the ranks it climbed to are switched on for the next run. Only the
  // ranks EARNED are drawn — the one above is not a locked node, it is not
  // on the board (see the column note at the top of the file)
  const rank = mutationRank(progress);
  const active = activeMutations(progress);
  const mutVisible = MUTATIONS.filter((a) => a.level <= rank);

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
              {/* HOME'S LEFT ARM: the reach out to the mutation column.
                  Drawn in the column's own colour rather than the tree's
                  gold — the branch is part of the same tree, and gold on
                  this board means bought */}
              <line
                x1={centerX(techNode("home").x)}
                y1={centerY(techNode("home").y)}
                x2={centerX(MUT_X)}
                y2={centerY(0)}
                stroke={rank > 0 ? MUT_LIT : "#4A4A55"}
                strokeWidth={2}
                strokeDasharray={rank > 0 ? undefined : "6 4"}
              />
              {/* THE CHAIN ITSELF, one link per rank EARNED — a switch that
                  is on is lit, one left off is solid and grey. There is no
                  dashed link, because there is no node past the rank for
                  one to point at */}
              {mutVisible.map((a) => (
                <line
                  key={`asc-${a.level}`}
                  x1={centerX(MUT_X)}
                  y1={centerY(mutY(a.level) - 1)}
                  x2={centerX(MUT_X)}
                  y2={centerY(mutY(a.level))}
                  stroke={active.includes(a.level) ? MUT_LIT : "#4A4A55"}
                  strokeWidth={2}
                />
              ))}
            </svg>
            {visible.map((n) => {
              const status: NodeStatus = nodeStatus(progress, n.id);
              const points = progress.tech[n.id] ?? 0;
              const name = nodeName(n.id);
              // a turret stacks capacity forever; a utility is a switch, and
              // once it is on the node has nothing left to sell
              const utility = !isTowerNode(n.id);
              const owned = points > 0;
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
                        ? `${name}: show price, tap again to buy`
                        : utility
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
                      (utility ? (
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
                        {utility ? (owned ? "Owned" : "Locked") : `Capacity ${points}`}
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
                        <span style={{ color: difficultyColor(techNode(n.id).requiresTier ?? 0) }}>
                          {difficultyName(techNode(n.id).requiresTier ?? 0)}
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
            {/* THE MUTATION COLUMN, home's left arm. The marker states the
                rank the save has climbed to and takes no click; below it
                one switch per rank EARNED, each of which toggles rather
                than buys. At rank 0 the marker is the whole column — what
                the first mutation is stays unsaid until a boss falls */}
            <div
              className="group absolute"
              style={{
                left: centerX(MUT_X) - NODE / 2,
                top: centerY(0) - NODE / 2,
                width: NODE,
                height: NODE,
              }}
            >
              <button
                type="button"
                aria-label={`Mutation: rank ${rank}`}
                onClick={() => setArmed(MUT_MARKER)}
                className="flex h-full w-full flex-col items-center justify-center rounded-lg border-2 border-[#4A4A55] bg-[#151518] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF8ACB]">
                <svg
                  viewBox="0 0 24 24"
                  className={`h-8 w-8 ${rank > 0 ? "fill-[#FF8ACB]" : "fill-[#71717C]"}`}
                  aria-hidden="true"
                >
                  <path d={MUT_GLYPH} />
                </svg>
                <span
                  className={`text-[13px] font-bold ${rank > 0 ? "text-[#FF8ACB]" : "text-[#71717C]"}`}
                >
                  {rank}
                </span>
              </button>
              <div
                className={`text-center text-[12px] font-bold uppercase tracking-widest ${
                  rank > 0 ? "text-[#EDEDEF]" : "text-[#71717C]"
                }`}
              >
                Mutation
              </div>
              {/* WHAT THE COLUMN IS FOR, in the same card every other node
                  on this board explains itself with. The marker takes no
                  action — there is nothing here to buy or flip — but it is
                  still the thing a player points at to ask what mutation
                  IS, so it answers on hover and on the first tap exactly as
                  a node does. Without it the column at rank 0 is a glyph, a
                  zero and a word, and nothing says these are not upgrades */}
              <div
                className={`pointer-events-none absolute bottom-full left-1/2 z-10 mb-3 w-56 -translate-x-1/2 rounded border border-[#4A4A55] bg-[#151518] p-3 text-left shadow-lg ${
                  touch && armed === MUT_MARKER
                    ? "block"
                    : "hidden group-hover:block group-focus-within:block"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-bold text-[#EDEDEF]">Mutation</span>
                  <span className="text-[13px] text-[#A6A6AF]">Rank {rank}</span>
                </div>
                <div className="mt-1 text-[14px] text-[#A6A6AF]">
                  Difficulty modifiers that drastically change how the game plays
                  and feels. Available after defeating your first boss.
                </div>
              </div>
            </div>
            {mutVisible.map((a) => (
              <MutationNode
                key={a.level}
                def={a}
                on={active.includes(a.level)}
                touch={touch}
                armed={armed === mutKey(a.level)}
                onArm={() => setArmed(mutKey(a.level))}
                onToggle={() => {
                  saveMutation(a.level, !active.includes(a.level));
                  onChanged();
                }}
              />
            ))}

      </div>

      {/* floating chrome: the board pans underneath it. The wrapper eats no
          pointer events; each control opts back in and carries data-ui so a
          drag starting on it never grabs the board */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-[max(1rem,var(--safe-t))] left-[max(1rem,var(--safe-l))]"
          data-ui
        >
          <button onClick={onBack} className={chromeBtn}>
            {backLabel}
          </button>
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
        <div className="absolute bottom-[max(1rem,var(--safe-b))] left-[max(1rem,var(--safe-l))] text-[11px] uppercase tracking-widest text-[#4A4A55]">
          drag · wasd to pan &nbsp;—&nbsp; scroll to zoom
        </div>
      </div>
    </div>
  );
}
