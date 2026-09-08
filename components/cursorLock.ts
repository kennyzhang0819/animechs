"use client";

import { useEffect } from "react";

/**
 * KEEP THE CURSOR INSIDE THE GAME.
 *
 * A window with no frame — fullscreen or borderless — has no edge that
 * stops a mouse. Push the cursor at the left edge to pan the view with a
 * second monitor over there and it sails onto the other screen, and the
 * next click is on whatever was behind the game. There is no call in
 * Electron or Chromium that pins the system cursor inside a window
 * (ClipCursor has no web or Electron equivalent); the ONE primitive there
 * is, on any platform, is POINTER LOCK. So:
 *
 * - the pointer is locked, which hides the system cursor and turns every
 *   mouse event into a movement delta rather than a place
 * - the deltas move a cursor of our own, clamped to the window, drawn as
 *   an arrow over everything (the div below)
 * - every real mouse event is caught in the capture phase at `window` and
 *   STOPPED THERE — under lock its coordinates are frozen garbage — and
 *   re-dispatched at our cursor's place, on whatever element is under it
 *   (`retarget`). The game's canvas listeners and every React handler in
 *   the HUD see an ordinary mouse event where the player is pointing, and
 *   neither knows the difference.
 * - and the page is given a SECOND hover state that follows the arrow
 *   (`mirrorHover` below), because the real `:hover` follows the real
 *   cursor and the real cursor is parked.
 *
 * ESCAPE IS NOT AN UNLOCK. The browser drops the lock on Escape and there
 * is no call that refuses it — but Escape in a run is the game's own key,
 * and it means one thing at a time (cancel the build, drop the selection,
 * and only then bring up the menu: Game.onKeyDown). Only the last of those
 * lets the cursor out, and it lets it out by turning this hook OFF, the
 * same as the pause button does. Every other press has the lock BACK
 * before the player notices: `regrab` retries until it is held again,
 * around Chromium's cooldown after an Escape and its demand for a fresh
 * gesture, and the arrow stays on screen and on the real cursor for the
 * moment in between, so a press that lands in the gap still lands where
 * the player is pointing. The cursor gets out at the pause menu, at the
 * end of a run, on the way back to the title, and on alt-tab or the
 * Windows key — anything that takes the focus takes the lock with it, and
 * the focus coming back takes it again.
 */

/** our own events, so the gate below lets them through instead of eating them */
const MINE = "__mechswarmCursor";

/** the arrow's own hover state, standing in for `:hover` (see mirrorHover) */
const HOVER = "data-ms-hover";

/** the events under lock: a place we have to correct, or a wheel to pass on */
const GATED = [
  "pointerdown",
  "pointerup",
  "pointermove",
  "mousedown",
  "mouseup",
  "mousemove",
  "click",
  "dblclick",
  "contextmenu",
  "wheel",
] as const;

type Flagged = Event & { [MINE]?: true };

const clamp = (v: number, hi: number): number => (v < 0 ? 0 : v > hi ? hi : v);

/** the arrow, drawn over everything and never in the way of a press */
function makeCursor(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform";
  el.innerHTML =
    '<svg width="18" height="26" viewBox="0 0 18 26" fill="none">' +
    '<path d="M1.5 1.2 L1.5 18.6 L5.9 14.6 L9 21.6 L12.2 20.2 L9.2 13.5 L14.6 13.2 Z" ' +
    'fill="#EDEDEF" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  return el;
}

/* ---- THE HOVER, WHILE THE REAL CURSOR IS PARKED ------------------------
   `:hover` is a state of the REAL cursor, and under pointer lock the real
   cursor is parked where the lock took hold and never moves again. So
   every hover rule in the page — the gold bevel a button takes, Tailwind's
   `hover:` utilities, a `group-hover:` that lights a child — is dead for as
   long as the lock is on, and the HUD reads as frozen under the arrow.

   The page is therefore given a SECOND hover state that we drive: the
   HOVER attribute, set on the element the arrow is over and on every one
   of its ancestors, which is exactly the set the real `:hover` matches.
   `mirrorHover` walks every stylesheet in the document and re-emits each
   rule that mentions `:hover` with `[data-ms-hover]` in its place — same
   declarations, same at-rule stack (`@media`, `@supports`, `@layer`,
   `@container`) — so a mirrored rule lands in the SAME CASCADE LAYER as
   the one it copies, at the same specificity, and wins only the ties, by
   coming later. Nothing else in the page changes weight.

   Two things keep the walk from being a one-liner. Tailwind v4 writes its
   utilities NESTED (`.hover\:text-white { &:hover { @media (hover:hover)
   { … } } }`), so a rule with no `:hover` in its own selector may still
   have hover rules under it: every style rule is recursed into, and a
   nested selector is resolved against its parent (`&` as `:is(parent)`).
   And a stylesheet from another origin throws on `.cssRules`, which is
   nothing to report — it is skipped, and the page keeps every hover rule
   we can reach. */

/** `@media (…)`, `@supports (…)`, `@layer x`, `@container …` — or "" */
function prelude(rule: CSSRule): string {
  if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) {
    return `@media ${rule.media.mediaText}`;
  }
  if (typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule) {
    return `@supports ${rule.conditionText}`;
  }
  if (typeof CSSLayerBlockRule !== "undefined" && rule instanceof CSSLayerBlockRule) {
    return `@layer ${rule.name}`;
  }
  if (typeof CSSContainerRule !== "undefined" && rule instanceof CSSContainerRule) {
    return `@container ${rule.conditionText}`;
  }
  return "";
}

/** a nested selector against the one it sits in: `&:hover` → `:is(.b):hover` */
function resolve(sel: string, parent: string): string {
  if (!parent) return sel;
  const outer = `:is(${parent})`;
  return sel.includes("&")
    ? sel.replace(/&/g, outer)
    : sel
        .split(",")
        .map((s) => `${outer} ${s.trim()}`)
        .join(",");
}

/**
 * Every `:hover` rule in the document, copied with the arrow's own hover
 * attribute in place of `:hover`, as one stylesheet appended last.
 */
function mirrorHover(): HTMLStyleElement | null {
  const out: string[] = [];
  const visit = (rules: CSSRuleList, parent: string, conds: string[]): void => {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (typeof CSSStyleRule !== "undefined" && rule instanceof CSSStyleRule) {
        const sel = resolve(rule.selectorText, parent);
        const decls = rule.style.cssText;
        if (decls && sel.includes(":hover")) {
          const mirrored = sel.replace(/:hover/g, `[${HOVER}]`);
          out.push(
            conds.map((c) => `${c}{`).join("") +
              `${mirrored}{${decls}}` +
              "}".repeat(conds.length),
          );
        }
        // Tailwind v4 nests: the hover rule can be UNDER a rule that has
        // no hover of its own, and its declarations under a media inside it
        if (rule.cssRules && rule.cssRules.length) visit(rule.cssRules, sel, conds);
        continue;
      }
      const p = prelude(rule);
      if (p && rule instanceof CSSGroupingRule) visit(rule.cssRules, parent, [...conds, p]);
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another origin: not ours to read, and not an error
    }
    if (rules) visit(rules, "", []);
  }
  if (!out.length) return null;

  const el = document.createElement("style");
  el.dataset.msCursorHover = "";
  el.textContent = out.join("\n");
  document.head.appendChild(el);
  return el;
}

export function useCursorLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const target = document.body;
    let locked = false;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    /** what the arrow was last over, so enter/leave can be told to React */
    let over: Element | null = null;
    /** that element and its ancestors: the set `:hover` would have matched */
    let hovered: Element[] = [];
    /** movement is counted from pointermove; mousemove only if there is no pointermove */
    let sawPointer = false;
    let cursor: HTMLElement | null = null;
    let sheet: HTMLStyleElement | null = null;
    let retry = 0;

    const draw = (): void => {
      if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`;
    };

    /** the arrow's hover: the element under it, and everything around it */
    const setHover = (el: Element | null): void => {
      const next: Element[] = [];
      for (let n: Element | null = el; n; n = n.parentElement) next.push(n);
      for (const was of hovered) if (!next.includes(was)) was.removeAttribute(HOVER);
      for (const now of next) if (!hovered.includes(now)) now.setAttribute(HOVER, "");
      hovered = next;
    };

    /**
     * Re-dispatch one real event where the arrow is. Whatever the element
     * under it makes of it — a preventDefault on a wheel, say — is carried
     * back to the real event, which is still the one the browser is
     * waiting on.
     */
    const retarget = (e: MouseEvent): void => {
      const el = document.elementFromPoint(x, y);
      if (!el) return;
      const init: MouseEventInit = {
        bubbles: true,
        cancelable: e.cancelable,
        composed: true,
        view: window,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: e.button,
        buttons: e.buttons,
        detail: e.detail,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      };
      let out: Flagged;
      if (e.type === "wheel") {
        const w = e as WheelEvent;
        out = new WheelEvent("wheel", {
          ...init,
          deltaX: w.deltaX,
          deltaY: w.deltaY,
          deltaZ: w.deltaZ,
          deltaMode: w.deltaMode,
        });
      } else if (e instanceof PointerEvent) {
        out = new PointerEvent(e.type, {
          ...init,
          pointerId: e.pointerId,
          pointerType: "mouse",
          isPrimary: true,
          width: 1,
          height: 1,
          pressure: e.pressure,
        });
      } else {
        out = new MouseEvent(e.type, init);
      }
      out[MINE] = true;
      el.dispatchEvent(out);
      if (e.cancelable && out.defaultPrevented) e.preventDefault();

      // THE ARROW MOVING FROM ONE ELEMENT TO ANOTHER IS A HOVER: React
      // builds onMouseEnter/onMouseLeave out of mouseover/mouseout, the
      // game's canvas drops what it was pointing at on pointerleave, and
      // the CSS hover rules are mirrored onto the attribute setHover sets
      if ((e.type === "mousemove" || e.type === "pointermove") && el !== over) {
        const left = over;
        over = el;
        setHover(el);
        const hop = (type: string, on: Element | null, related: Element | null): void => {
          if (!on) return;
          const opts = { ...init, bubbles: !type.endsWith("leave") && !type.endsWith("enter"), relatedTarget: related };
          const ev: Flagged = type.startsWith("pointer")
            ? new PointerEvent(type, { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true })
            : new MouseEvent(type, opts);
          ev[MINE] = true;
          on.dispatchEvent(ev);
        };
        for (const type of ["mouseout", "pointerout", "pointerleave", "mouseleave"]) hop(type, left, el);
        for (const type of ["mouseover", "pointerover", "pointerenter", "mouseenter"]) hop(type, el, left);
      }
    };

    /**
     * THE GATE. Every mouse event in the page passes here first (capture,
     * at the window, before anything the game or React has bound). A real
     * one under lock is stopped dead and re-issued in the right place; our
     * own re-issued event is waved through, and so is every event in the
     * gap between a lock dropped and the lock taken back, where a real
     * event already carries the place the arrow is drawn at.
     */
    const gate = (e: Event): void => {
      if ((e as Flagged)[MINE]) return;
      if (!locked) return;
      e.stopImmediatePropagation();
      const m = e as MouseEvent;
      if (e.type === "pointermove" || e.type === "mousemove") {
        if (e.type === "pointermove") sawPointer = true;
        if (e.type === "pointermove" || !sawPointer) {
          x = clamp(x + m.movementX, window.innerWidth - 1);
          y = clamp(y + m.movementY, window.innerHeight - 1);
          draw();
        }
        // one move out for one move in: the pointermove carries the
        // deltas, the mousemove that follows it carries the hover
        retarget(m);
        return;
      }
      retarget(m);
    };

    /**
     * Where the real cursor is while the lock is NOT held — before the
     * first one is granted, and in the moment after an Escape. The arrow
     * is drawn there, so it is never anywhere but under the player's hand
     * when the lock comes back.
     */
    const trackReal = (e: MouseEvent): void => {
      if (locked) return;
      x = clamp(e.clientX, window.innerWidth - 1);
      y = clamp(e.clientY, window.innerHeight - 1);
      draw();
      const el = document.elementFromPoint(x, y);
      over = el;
      setHover(el);
    };

    const grab = (): void => {
      if (locked || document.pointerLockElement) return;
      // a window that is not the one being typed into cannot hold the
      // pointer, and asking every second while the player is in another
      // app is asking for nothing: the focus coming back asks again
      if (!document.hasFocus()) return;
      // a refusal (no user gesture yet, or Chromium's cooldown after an
      // Escape) is not an error worth reporting: we ask again
      void Promise.resolve(target.requestPointerLock()).catch(() => regrab());
    };

    /**
     * THE LOCK COMES BACK BY ITSELF. Escape drops it in the browser before
     * any of our code runs, and after that Chromium wants both a cooldown
     * (about a second and a quarter) and a fresh user gesture before it
     * will grant another. So we ask on a timer AND on the next press or
     * key — whichever comes first — until it is held again or this hook is
     * turned off, which is what the pause menu and the end of a run do.
     */
    const regrab = (): void => {
      if (retry || locked) return;
      retry = window.setTimeout(() => {
        retry = 0;
        grab();
      }, 1400);
    };

    const onChange = (): void => {
      locked = document.pointerLockElement === target;
      if (locked) {
        if (retry) {
          clearTimeout(retry);
          retry = 0;
        }
        draw();
      } else {
        // the arrow stays: it is the only cursor the player has now, and
        // it follows the real one (trackReal) until the lock is back
        sawPointer = false;
        regrab();
      }
    };

    /* the arrow and the mirrored hover rules belong to the hook being on,
       not to the lock being held this instant — the lock comes and goes
       (an Escape, an alt-tab) and the cursor may not blink out with it */
    cursor = makeCursor();
    document.body.appendChild(cursor);
    document.documentElement.style.cursor = "none";
    sheet = mirrorHover();
    draw();

    for (const type of GATED) {
      window.addEventListener(type, gate, { capture: true, passive: false });
    }
    window.addEventListener("mousemove", trackReal, true);
    // the press or the key that re-takes a lock the browser let go of, and
    // the first one when the lock was refused for want of a gesture
    window.addEventListener("pointerdown", grab, true);
    window.addEventListener("keydown", grab, true);
    document.addEventListener("pointerlockchange", onChange);
    window.addEventListener("focus", grab);
    grab();

    return () => {
      for (const type of GATED) window.removeEventListener(type, gate, true);
      window.removeEventListener("mousemove", trackReal, true);
      window.removeEventListener("pointerdown", grab, true);
      window.removeEventListener("keydown", grab, true);
      document.removeEventListener("pointerlockchange", onChange);
      window.removeEventListener("focus", grab);
      if (retry) clearTimeout(retry);
      retry = 0;
      setHover(null);
      cursor?.remove();
      cursor = null;
      sheet?.remove();
      sheet = null;
      document.documentElement.style.cursor = "";
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [active]);
}
