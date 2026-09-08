"use client";

import { useEffect, useRef } from "react";

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
 *   STOPPED THERE, then re-dispatched at our cursor's place, on whatever
 *   element is under it (`retarget`). The game's canvas listeners and
 *   every React handler in the HUD see an ordinary mouse event where the
 *   player is pointing, and neither knows the difference.
 * - and the page is given a second hover state that follows the arrow
 *   (`mirrorHover`), because the real `:hover` follows the real cursor and
 *   the real cursor is parked.
 *
 * THREE RULES, and everything below is one of them:
 *
 * 1. THE ARROW NEVER JUMPS. It moves by MOVEMENT, never by place — the
 *    deltas of every mouse event, lock or no lock — so it cannot be teleported
 *    by an event carrying the frozen coordinates the lock hands out, or by
 *    the real cursor sitting somewhere else while the lock is off. It is
 *    put down once, where the real cursor was when the game took over
 *    (`lastReal`), and from there it is only ever nudged.
 *
 * 2. THERE IS ONLY EVER ONE CURSOR. A dropped lock puts the system cursor
 *    back on the screen — and the page is full of elements with a `cursor`
 *    of their own, which a `cursor:none` on the root does not cover — so
 *    the arrow used to have the system cursor beside it for as long as the
 *    lock took to come back. `hideCursor` is `* { cursor: none !important }`
 *    for as long as this hook is on, whatever the lock is doing.
 *
 * 3. ONE ESCAPE IS ONE ESCAPE. Chromium releases the pointer on Escape
 *    ITSELF and EATS THE KEY: the page is never told, which is why the
 *    pause menu used to want two presses (the first was spent on the lock,
 *    the second reached the game). So the RELEASE is what we listen to —
 *    an unexpected unlock, with the window still focused, IS the Escape
 *    press, and it is handed to `onEscape` on the spot. A real Escape that
 *    does arrive right after is swallowed, so the menu never toggles twice
 *    for one press.
 *
 * The lock is therefore held for as long as the player is in the game, the
 * pause menu included: releasing it there would put the system cursor back
 * wherever the lock had parked it, which is the jump rule 1 exists to
 * stop. The way out to another screen is the way out of any fullscreen
 * game — alt-tab, or the Windows key — which takes the focus, and the
 * focus coming back takes the lock again with the arrow where it was left.
 */

/** our own events, so the gate below lets them through instead of eating them */
const MINE = "__mechswarmCursor";

/** the arrow's own hover state, standing in for `:hover` (see mirrorHover) */
const HOVER = "data-ms-hover";

/**
 * How long a real Escape is swallowed after the lock's release has already
 * stood in for it. Long enough to catch the echo of the SAME press (a
 * browser that both releases the lock and delivers the key), short enough
 * that a player hammering Escape to open and close the menu is never
 * pressing into a dead window.
 */
const ESC_ECHO_MS = 250;

/** how often a lock the browser took away is asked for again */
const REGRAB_MS = 500;

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

/**
 * WHERE THE REAL CURSOR WAS LAST SEEN, kept from the moment this module
 * loads rather than from the moment the lock turns on: the arrow is put
 * down here, and a player who starts a run by clicking Resume in the
 * corner gets an arrow in that corner instead of one in the middle of the
 * screen. Frozen coordinates under lock, and our own re-dispatched events,
 * are not the real cursor and are not recorded.
 */
const lastReal = { x: -1, y: -1 };
if (typeof window !== "undefined") {
  window.addEventListener(
    "mousemove",
    (e: MouseEvent) => {
      if (document.pointerLockElement || (e as Flagged)[MINE]) return;
      lastReal.x = e.clientX;
      lastReal.y = e.clientY;
    },
    { capture: true, passive: true },
  );
}

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

/**
 * RULE 2. The system cursor is hidden by the lock itself — but the lock is
 * not always on (Escape drops it, and Chromium will not hand it back for
 * about a second and a quarter), and `cursor:none` on the root loses to
 * every `cursor` an element sets for itself: a button's pointer, the
 * canvas's crosshair. One `!important` rule over the whole document is
 * what actually leaves the arrow alone on the screen.
 */
function hideCursor(): HTMLStyleElement {
  const el = document.createElement("style");
  el.dataset.msCursorHide = "";
  el.textContent = "*{cursor:none!important}";
  document.head.appendChild(el);
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

/**
 * @param active whether the game is holding the cursor at all
 * @param onEscape what an Escape press means — called when the BROWSER's
 * own release of the lock is the only sign of one (rule 3). The latest one
 * given is always the one called; changing it does not re-take the lock.
 */
export function useCursorLock(active: boolean, onEscape?: () => void): void {
  const esc = useRef(onEscape);
  esc.current = onEscape;

  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    const target = document.body;
    let locked = false;
    let x = lastReal.x >= 0 ? lastReal.x : window.innerWidth / 2;
    let y = lastReal.y >= 0 ? lastReal.y : window.innerHeight / 2;
    /** what the arrow was last over, so enter/leave can be told to React */
    let over: Element | null = null;
    /** that element and its ancestors: the set `:hover` would have matched */
    let hovered: Element[] = [];
    /** movement is counted from pointermove; mousemove only if there is no pointermove */
    let sawPointer = false;
    /** we are the ones dropping the lock: it is not an Escape (rule 3) */
    let releasing = false;
    /** when the release stood in for an Escape, so the real key is swallowed */
    let escAt = 0;
    let retry = 0;

    const cursor = makeCursor();
    document.body.appendChild(cursor);
    const hide = hideCursor();
    const mirror = mirrorHover();

    const draw = (): void => {
      cursor.style.transform = `translate(${x}px, ${y}px)`;
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
     * waiting on. This happens WHETHER OR NOT THE LOCK IS HELD: in the
     * moment after an Escape the real cursor is somewhere else entirely,
     * and a click has to land where the player can see they are pointing.
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
     * at the window, before anything the game or React has bound), is
     * stopped dead, and is re-issued where the arrow is; our own re-issued
     * events are waved through. A move is taken for its MOVEMENT ONLY
     * (rule 1) — `movementX` is what the lock hands out, and it is what an
     * unlocked mouse hands out too, so the arrow travels the same way
     * whether the lock is held this instant or not.
     */
    const gate = (e: Event): void => {
      if ((e as Flagged)[MINE]) return;
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
     * RULE 3, second half. Chromium eats the Escape that releases the lock
     * — but if a build ever gets one through (another engine, a lock that
     * was already off), the game must not act on it twice: the release has
     * already spoken for it.
     */
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === "Escape" && performance.now() - escAt < ESC_ECHO_MS) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
      grab(); // any key is a gesture, and a gesture is what a re-lock wants
    };

    const grab = (): void => {
      if (locked || document.pointerLockElement) return;
      // a window that is not the one being typed into cannot hold the
      // pointer, and asking every half second while the player is in
      // another app is asking for nothing: the focus coming back asks
      if (!document.hasFocus()) return;
      // a refusal (no gesture yet, or Chromium's cooldown after an Escape)
      // is not an error worth reporting: we ask again
      void Promise.resolve(target.requestPointerLock()).catch(() => regrab());
    };

    /**
     * THE LOCK COMES BACK BY ITSELF. Chromium wants both a cooldown (about
     * a second and a quarter after an Escape) and a fresh user gesture
     * before it grants another, so we ask on a short timer and on the next
     * press or key, whichever comes first. The arrow is on screen and
     * driving every event throughout, so the gap costs the player nothing
     * but the freedom of a cursor they cannot see leaving the window.
     */
    const regrab = (): void => {
      if (retry || locked) return;
      retry = window.setTimeout(() => {
        retry = 0;
        grab();
      }, REGRAB_MS);
    };

    const onChange = (): void => {
      locked = document.pointerLockElement === target;
      if (locked) {
        if (retry) {
          clearTimeout(retry);
          retry = 0;
        }
        return;
      }
      sawPointer = false;
      if (releasing) return; // our own exit, on the way out of the game
      // RULE 3: the browser took the lock away while the game still had
      // the focus. Nothing but Escape does that — alt-tab and the Windows
      // key take the focus with it — so this IS the player's Escape, and
      // it is the only sign of it we are ever going to get
      if (document.hasFocus()) {
        escAt = performance.now();
        esc.current?.();
      }
      regrab();
    };

    draw();
    for (const type of GATED) {
      window.addEventListener(type, gate, { capture: true, passive: false });
    }
    // the press or the key that re-takes a lock the browser let go of, and
    // the first one when the lock was refused for want of a gesture
    window.addEventListener("pointerdown", grab, true);
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerlockchange", onChange);
    window.addEventListener("focus", grab);
    grab();

    return () => {
      for (const type of GATED) window.removeEventListener(type, gate, true);
      window.removeEventListener("pointerdown", grab, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("focus", grab);
      if (retry) clearTimeout(retry);
      retry = 0;
      setHover(null);
      cursor.remove();
      mirror?.remove();
      hide.remove();
      releasing = true;
      if (document.pointerLockElement) document.exitPointerLock();
      // last, so the exit above is not read as an Escape
      document.removeEventListener("pointerlockchange", onChange);
    };
  }, [active]);
}
