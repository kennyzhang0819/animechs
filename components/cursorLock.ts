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
 *
 * WHAT IT COSTS: `:hover` is a state of the real cursor, and the real
 * cursor is parked. React's onMouseEnter/onMouseLeave still fire (they are
 * built from the mouseover/mouseout we re-dispatch), so tooltips and hover
 * cards work — but a CSS :hover highlight on a button does not light up
 * while the lock is on. That is the whole of the price.
 *
 * HOW THE CURSOR GETS OUT: Escape (the browser's own release, and this
 * game's pause key — the menu is up by the time the cursor is free),
 * alt-tab, or the Windows key. Anything that takes the focus away takes
 * the lock with it. The next press inside the game takes it back, which is
 * also how a lock that was refused for want of a user gesture is retried.
 */

/** our own events, so the gate below lets them through instead of eating them */
const MINE = "__mechswarmCursor";

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

export function useCursorLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const target = document.body;
    let locked = false;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    /** what the arrow was last over, so enter/leave can be told to React */
    let over: Element | null = null;
    /** movement is counted from pointermove; mousemove only if there is no pointermove */
    let sawPointer = false;
    let cursor: HTMLElement | null = null;

    const draw = (): void => {
      if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`;
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
      // builds onMouseEnter/onMouseLeave out of mouseover/mouseout, and
      // the game's canvas drops what it was pointing at on pointerleave
      if ((e.type === "mousemove" || e.type === "pointermove") && el !== over) {
        const left = over;
        over = el;
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
     * own re-issued event is waved through.
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

    /** where the real cursor was when the lock took hold: the arrow starts there */
    const trackReal = (e: MouseEvent): void => {
      if (locked) return;
      x = clamp(e.clientX, window.innerWidth - 1);
      y = clamp(e.clientY, window.innerHeight - 1);
    };

    const grab = (): void => {
      if (locked || document.pointerLockElement) return;
      // a refusal (no user gesture yet, or the browser's cooldown after an
      // Escape) is not an error worth reporting: the next press tries again
      void Promise.resolve(target.requestPointerLock()).catch(() => {});
    };

    const onChange = (): void => {
      locked = document.pointerLockElement === target;
      if (locked) {
        if (!cursor) {
          cursor = makeCursor();
          document.body.appendChild(cursor);
        }
        document.documentElement.style.cursor = "none";
        draw();
      } else {
        cursor?.remove();
        cursor = null;
        over = null;
        document.documentElement.style.cursor = "";
      }
    };

    for (const type of GATED) {
      window.addEventListener(type, gate, { capture: true, passive: false });
    }
    window.addEventListener("mousemove", trackReal, true);
    // the press that re-takes a lock the player let go of, and the first
    // one when the lock was refused for want of a gesture
    window.addEventListener("pointerdown", grab, true);
    document.addEventListener("pointerlockchange", onChange);
    window.addEventListener("focus", grab);
    grab();

    return () => {
      for (const type of GATED) window.removeEventListener(type, gate, true);
      window.removeEventListener("mousemove", trackReal, true);
      window.removeEventListener("pointerdown", grab, true);
      document.removeEventListener("pointerlockchange", onChange);
      window.removeEventListener("focus", grab);
      cursor?.remove();
      cursor = null;
      document.documentElement.style.cursor = "";
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [active]);
}
