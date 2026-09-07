"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

/**
 * THE HOVER CARD — one tooltip for every chip, tile and face in the game:
 * a bordered black card with a title, an optional tag in the corner, and
 * a sentence. The track's reward chips (Progress), the codex tiles
 * (MutationTree) and the deploy screen's mutator faces (MechSwarm) all
 * open this one.
 *
 * IT IS PORTALLED ONTO THE BODY AND PINNED BY THE ANCHOR'S SCREEN
 * RECTANGLE, never rendered inside the thing it describes. That is the
 * whole point of it: a card that lives inside a row lives under that
 * row's mask, opacity, overflow and stacking order, and every one of
 * those has made a tooltip translucent, clipped or buried at some point.
 * On the body it is fully opaque, always on top, and the same size
 * whatever board zoom or row fade its anchor sits under (it takes the
 * UI-size knob, ui-zoom, and nothing else).
 *
 * Usage: `const tip = useHoverCard("up")`, spread `tip.anchorProps` onto
 * the element the card hangs off, and render `<HoverCard tip={tip} …/>`.
 * `align` picks which of the anchor's edges it grows from, so a card on
 * an anchor in the right margin (the field's deal stack) opens inward.
 */

export type HoverDir = "up" | "down";

/**
 * WHICH WAY A CARD OPENS. "up" and "down" are the anchor's own choice;
 * "auto" leaves it to the SCREEN, resolved at the moment the card opens —
 * an anchor in the top half opens downward, one in the bottom half opens
 * upward. That is what a scrolling list needs: the same chip is near the
 * top of the window on one scroll position and near the bottom on
 * another, and a fixed direction puts the card off-screen at one of them.
 */
export type HoverWant = HoverDir | "auto";

/**
 * THE UI-SIZE KNOB THE CARD IS DRAWN UNDER. The card carries .ui-zoom,
 * and CSS `zoom` multiplies EVERY length on the element it is set on —
 * `left` and `top` included, not just the box. Its anchor's rectangle
 * comes back from getBoundingClientRect in real screen pixels, so pinning
 * the card at those numbers puts it at scale-times-too-far from the
 * corner: at 1.25 a chip at x=400 got its card at x=500. Dividing the
 * point by the scale lands it where the anchor is at any UI size.
 */
function uiScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

export interface HoverAnchor {
  ref: RefObject<HTMLElement | null>;
  /** the anchor's screen point while open — null is closed */
  at: { x: number; y: number; w: number } | null;
  dir: HoverDir;
  anchorProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: () => void;
  };
}

/** the hover/focus state and the anchor's rectangle, for one HoverCard */
export function useHoverCard(want: HoverWant): HoverAnchor {
  const ref = useRef<HTMLElement | null>(null);
  const [at, setAt] = useState<HoverAnchor["at"]>(null);
  const [dir, setDir] = useState<HoverDir>(want === "auto" ? "up" : want);
  const open = (): void => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // an "auto" anchor picks its side from where it is standing right now
    const d: HoverDir = want === "auto" ? (r.top > window.innerHeight / 2 ? "up" : "down") : want;
    setDir(d);
    // stored already in the card's own (zoomed) coordinate space — see uiScale
    const z = uiScale();
    setAt({ x: r.left / z, y: (d === "up" ? r.top : r.bottom) / z, w: r.width / z });
  };
  const close = (): void => setAt(null);
  return {
    ref,
    at,
    dir,
    anchorProps: { onMouseEnter: open, onMouseLeave: close, onFocus: open, onBlur: close },
  };
}

export function HoverCard({
  tip,
  title,
  tag,
  color,
  children,
  align = "left",
}: {
  tip: HoverAnchor;
  title: string;
  /** a short word in the corner, in the border colour — a mutator's weight */
  tag?: string;
  /** the border, and the tag */
  color: string;
  /** the sentence */
  children: ReactNode;
  /**
   * WHICH EDGE THE CARD HANGS OFF. `left` (the default) runs it rightward
   * from the anchor's left edge, `center` centres it, and `right` runs it
   * LEFTWARD from the anchor's right edge — which is what an anchor in
   * the screen's right margin needs, since a 16rem card started at that
   * anchor's left edge would open off the side of the window.
   */
  align?: "left" | "center" | "right";
}) {
  if (!tip.at || typeof document === "undefined") return null;
  const { x, y, w } = tip.at;
  const dy = tip.dir === "up" ? "calc(-100% - 8px)" : "8px";
  const dx = align === "center" ? "-50%" : align === "right" ? "-100%" : "0";
  return createPortal(
    <span
      role="tooltip"
      className="ui-zoom pointer-events-none fixed z-50 block w-64 border-[3px] p-2.5 text-left normal-case tracking-normal shadow-lg"
      style={{
        left: align === "center" ? x + w / 2 : align === "right" ? x + w : x,
        top: y,
        transform: `translate(${dx}, ${dy})`,
        borderColor: color,
        background: "#0b0b0d",
      }}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-bold text-[#EDEDEF]">{title}</span>
        {tag && (
          <span
            className="shrink-0 text-[13px] font-bold uppercase tracking-widest"
            style={{ color }}
          >
            {tag}
          </span>
        )}
      </span>
      <span className="mt-1 block text-[14.5px] leading-snug text-[#A6A6AF]">{children}</span>
    </span>,
    document.body,
  );
}
