"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { clamp } from "@/game/constants";

/**
 * A BOARD IS A MAP, NOT A PAGE — and there is now more than one of them,
 * which is why the camera lives here instead of inside the tech tree.
 *
 * The tree used to be a vertically scrolling document, which stopped
 * working the moment it outgrew one screen in BOTH axes: a page can only
 * scroll one way, and the game one keystroke away already taught everyone
 * its camera. So a board is a fixed viewport over a transformed layer,
 * driven exactly like the field — WASD and arrows pan, the wheel zooms
 * about the cursor (a ctrl-tagged pinch delta uses a stronger factor), the
 * floating buttons zoom, and any drag on open ground or on a node drags the
 * board. The chrome floats over it.
 *
 * The camera lives in a REF and is applied to the layer imperatively:
 * panning at 60fps must not re-render the board, and a re-render from
 * buying a point re-applies the same transform from the ref, so the two
 * paths can never disagree.
 *
 * WHY THE CAMERA CAN BE OWNED FROM OUTSIDE (the `cam` prop). The tech tree
 * and the mutator codex are two boards behind one tab strip, so switching
 * tabs UNMOUNTS a board. A camera kept in here would then be re-fitted
 * every time, and a player who panned to the coil branch, glanced at the
 * mutators and came back would find the board yanked home. A parent that
 * outlives both tabs hands each one a ref and the pan survives the switch.
 * `null` means "never placed" — the board fits itself on first mount and
 * never again.
 */
export interface Cam {
  /** the visible top-left, in board px */
  x: number;
  y: number;
  /** scale */
  z: number;
}

/**
 * The zoom floor is low enough for the WHOLE tech tree to fit on a laptop
 * — that board grew by more than half when the upgrade rungs became nodes
 * with edges of their own, and a fit-on-mount that clamps is a board whose
 * first frame is a corner of itself.
 */
export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.5;
/** screen px of board that can never be panned off screen */
const EDGE_KEEP = 140;
/** pan speed while a key is held, in SCREEN px/s — zoom-independent */
const PAN_SPEED = 900;
/** finger travel (screen px) past which a gesture is a drag, not a tap */
export const DRAG_PX = 8;

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
 * The floating chrome's one button style. Every board pins the same
 * furniture — a back button top-left, a tab strip beside it, zoom buttons
 * bottom-right — so the class that makes them all look like one set of
 * controls is shared rather than copied.
 */
export const CHROME_BTN =
  "pointer-events-auto ms-btn px-3 py-1.5 text-[15px] text-[#a2a2a2] hover:text-white";

/**
 * ESCAPE IS THE BACK ARROW. Any screen that pins the arrow top-left — the
 * progress boards, the codex, the menu's inner views — leaves the same way
 * on Escape, because a player who has met one back button has met the key
 * that presses it. The screens call this beside the button rather than
 * each rolling their own listener, so the two can never disagree about
 * where back goes.
 *
 * TWO PRESSES ARE NOT OURS. A dialog over the screen owns Escape — it
 * closes and the screen underneath stays put — and Escape inside a field
 * belongs to the field, not to the page it happens to sit on.
 */
export function useEscapeBack(onBack: (() => void) | null): void {
  useEffect(() => {
    if (!onBack) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);
}

/** the standardized back: icon only, big, top-left — the same button every
 *  screen in the game pins in the same corner, and Escape presses it */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  useEscapeBack(onClick);
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="pointer-events-auto ms-btn h-11 w-11 p-0 text-[#a2a2a2] hover:text-white"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M14.7 5.1 7.8 12l6.9 6.9 1.7-1.7L11.2 12l5.2-5.2z" />
      </svg>
    </button>
  );
}

/**
 * THE TAB STRIP — which board you are looking at.
 *
 * It sits beside back, in the corner every screen already uses for "where
 * am I and how do I leave", and it wears each tab's OWN colour when it is
 * the one showing: gold for the tree, pink for the codex. That is the only
 * signal on either board that says which set of rules you are reading, and
 * it has to survive being glanced at from across a room.
 */
export function BoardTabs<T extends string>({
  tabs,
  active,
  onPick,
}: {
  tabs: readonly { id: T; label: string; color: string; glyph: string }[];
  active: T;
  onPick: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="board"
      className="pointer-events-auto ms-pane flex items-center gap-1 p-1"
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onPick(t.id)}
            className={`ms-btn h-9 gap-2 px-3 text-[15px] ${
              on ? "ms-btn-tint ms-on" : "ms-btn-ghost text-[#a2a2a2]"
            }`}
            style={{ "--ms-tint": t.color } as CSSProperties}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
              <path fillRule="evenodd" d={t.glyph} />
            </svg>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}


/**
 * The viewport, the transformed layer, and every gesture that moves it.
 *
 * `children` are laid out in BOARD px inside a layer of `width` x `height`;
 * `chrome` floats over the top and never moves. The wrapper around the
 * chrome eats no pointer events — each control opts back in (CHROME_BTN
 * does it) and carries `data-ui` so a drag starting on it grabs the button
 * rather than the board.
 */
export default function Board({
  width,
  height,
  cam: camProp,
  chrome,
  children,
}: {
  width: number;
  height: number;
  /** a camera owned by something that outlives this mount; see the note
   *  above Cam. Omitted, the board keeps its own and re-fits every mount */
  cam?: RefObject<Cam | null>;
  chrome?: ReactNode;
  children: ReactNode;
}) {
  const viewRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const ownCam = useRef<Cam | null>(null);
  const camStore = camProp ?? ownCam;
  // the live camera, never null once the first effect has run. Reads before
  // that (the first render's transform) fall back to the stored one or a
  // neutral view, which the fit immediately replaces
  const cam = useRef<Cam>(camStore.current ?? { x: 0, y: 0, z: 1 });
  // live pointers, for drag-pan and pinch; screen px travelled this gesture,
  // which is what tells a tap (a click on a node) from a drag (a pan)
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
    c.x = clamp(c.x, -(view.clientWidth - EDGE_KEEP) / c.z, width - EDGE_KEEP / c.z);
    c.y = clamp(c.y, -(view.clientHeight - EDGE_KEEP) / c.z, height - EDGE_KEEP / c.z);
    board.style.transform = camCss();
    // THE INVERSE SCALE, for anything inside the board that must not shrink
    // with it. A hover card is anchored to a node — so it has to live in the
    // scaled layer — but it is TEXT, and at the zoom floor (0.2) a 15px card
    // paints at 3px, which is why the tree's cards read as grey smudges when
    // the whole board is fitted on screen. A child that counter-scales by
    // this holds its screen size at every zoom. Written here rather than
    // pushed through React because the pan path deliberately never re-renders
    board.style.setProperty("--ms-inv", String(1 / c.z));
    // the owner's copy tracks every frame, so an unmount mid-pan still
    // leaves the tab exactly where it was let go of
    camStore.current = { ...c };
  }, [width, height, camStore]);

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
    // first ever mount of this camera: fit the whole board on screen,
    // centered, and never again — a re-render from buying a point, or a
    // trip to the other tab, must not yank the camera home
    if (!camStore.current) {
      const z = clamp(
        Math.min(view.clientWidth / (width + 120), view.clientHeight / (height + 200)),
        ZOOM_MIN,
        1.15,
      );
      cam.current = {
        x: (width - view.clientWidth / z) / 2,
        y: (height - view.clientHeight / z) / 2,
        z,
      };
    } else {
      cam.current = { ...camStore.current };
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
  }, [applyCam, zoomAt, zoomCenter, camStore, width, height]);

  return (
    <div
      ref={viewRef}
      className="fixed inset-0 select-none overflow-hidden bg-[#08080a]"
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
        className="ms-grid absolute left-0 top-0"
        style={{
          width,
          height,
          transformOrigin: "0 0",
          // re-renders (buying a point) re-apply the ref's own transform,
          // so React and the imperative pan can never disagree
          transform: camCss(),
          ["--ms-inv" as string]: String(1 / (cam.current.z || 1)),
        }}
      >
        {children}
      </div>

      {/* floating chrome: the board pans underneath it. It takes the
          UI-size knob (ui-zoom) while the board does not — the board has
          its own zoom, and the knob is about how big the BUTTONS are */}
      <div className="ui-zoom pointer-events-none absolute inset-0">
        {chrome}
        <div
          className="absolute bottom-[1rem] right-[1rem] flex flex-col gap-2"
          data-ui
        >
          <button
            aria-label="zoom in"
            onClick={() => zoomCenter(1.25)}
            className={`${CHROME_BTN} flex h-10 w-10 items-center justify-center p-0 text-[19px] font-bold`}
          >
            +
          </button>
          <button
            aria-label="zoom out"
            onClick={() => zoomCenter(0.8)}
            className={`${CHROME_BTN} flex h-10 w-10 items-center justify-center p-0 text-[19px] font-bold`}
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}
