"use client";

import { useEffect, useMemo, useState } from "react";
import { BUILD } from "@/game/version";

/**
 * THE ERROR SCREEN — where every failure in the app ends up.
 *
 * It says one thing, offers two buttons, and CARRIES THE FAULT ITSELF.
 *
 * It used to show the code and nothing else, on the grounds that a player
 * who crashes wants back into the game and a developer has the console.
 * That is true right up to the moment the crash happens to somebody who is
 * not sitting in front of devtools — which is every crash worth hearing
 * about — and then the only thing that comes back is seven characters. So
 * the one-line reason is always on screen and the STACK is one click
 * behind it, with a button that copies the lot for a bug report. The
 * console still gets the unscrubbed object, which is the better thing to
 * have when devtools IS open.
 *
 * Nothing here may name the toolkit the page was built with. It is also
 * deliberately SELF-CONTAINED — its own <style>, its own font stack, no
 * Tailwind and no class out of globals.css — because app/global-error.tsx
 * renders it in place of the root layout, where the stylesheet and the
 * font variables may never have loaded at all.
 */

export type CrashKind = "fault" | "lost";

const TITLE: Record<CrashKind, string> = {
  fault: "A bug occurred",
  lost: "Nothing here",
};

/** a short, stable code for one failure — enough for a bug report, and
    the only thing on screen that changes between crashes */
function faultCode(err: unknown, digest?: string): string {
  const seed =
    digest ??
    (err instanceof Error ? `${err.name}:${err.message}:${err.stack?.slice(0, 200) ?? ""}` : String(err));
  // FNV-1a, 32 bits — no cryptography, just the same crash getting the
  // same code twice
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, "0");
}

export default function CrashScreen({
  kind = "fault",
  error,
  digest,
  onRetry,
}: {
  kind?: CrashKind;
  error?: unknown;
  digest?: string;
  onRetry?: () => void;
}): React.JSX.Element {
  const code = useMemo(() => faultCode(error ?? kind, digest), [error, kind, digest]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  /** the fault as text: the reason on one line, then the stack under it */
  const detail = useMemo(() => {
    if (kind !== "fault" || error === undefined) return null;
    const head =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === "string"
          ? error
          : safeString(error);
    const stack = error instanceof Error ? (error.stack ?? "") : "";
    // a browser stack usually repeats the head line; do not print it twice
    const body = stack.startsWith(head) ? stack.slice(head.length).replace(/^\n/, "") : stack;
    return { head, body };
  }, [error, kind]);

  // the whole of it goes to the console, unscrubbed — that is where a
  // developer looks, and it is not a surface the player reads
  useEffect(() => {
    if (kind === "fault" && error !== undefined) console.error(`[${code}]`, error);
  }, [error, code, kind]);

  return (
    <div className="cs-root">
      <style>{CSS}</style>
      <div className="cs-vig" aria-hidden />
      <div className="cs-box" role="alert">
        <h1 className="cs-title">{TITLE[kind]}</h1>
        <div className="cs-acts">
          {onRetry ? (
            <button type="button" className="cs-btn cs-btn-accent" onClick={onRetry}>
              RESTART
            </button>
          ) : null}
          <button
            type="button"
            className="cs-btn"
            onClick={() => {
              // a whole document load, not a route change — whatever put
              // the game on the floor does not survive one
              window.location.href = "/";
            }}
          >
            MAIN MENU
          </button>
        </div>
        {detail ? <p className="cs-reason">{detail.head}</p> : null}
        <div className="cs-meta">
          {code} · build {BUILD}
        </div>
        {detail ? (
          <div className="cs-diag">
            <div className="cs-acts">
              <button type="button" className="cs-btn cs-btn-small" onClick={() => setOpen((v) => !v)}>
                {open ? "HIDE TRACE" : "SHOW TRACE"}
              </button>
              <button
                type="button"
                className="cs-btn cs-btn-small"
                onClick={() => {
                  const text = `[${code}] build ${BUILD}\n${detail.head}\n${detail.body}`;
                  // clipboard access can be refused (insecure origin, a
                  // permission policy); the trace is selectable either way
                  void navigator.clipboard?.writeText(text).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
            {open ? <pre className="cs-trace">{detail.body || "(no stack)"}</pre> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* Square corners, a 3px #454545 bevel, accent gold on the primary — the
   kit the rest of the game is drawn with (app/globals.css), restated here
   because this screen cannot assume that file ever loaded. */
const CSS = `
.cs-root{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;
  justify-content:center;padding:1.5rem;overflow:hidden;background:#0B0B0D;color:#C9C9D4;
  font-family:var(--font-body),Barlow,system-ui,sans-serif;font-weight:500;font-size:16px;
  line-height:1.4;-webkit-font-smoothing:antialiased;user-select:none;cursor:default;}
.cs-vig{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse at center,transparent 40%,rgba(0,0,0,.8) 100%);}
.cs-box{position:relative;display:flex;flex-direction:column;align-items:center;
  gap:1.5rem;padding:2.25rem 2.5rem;border:3px solid #454545;background:rgba(0,0,0,.62);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.85);text-align:center;}
.cs-title{margin:0;font-family:var(--font-display),"Chakra Petch",Barlow,sans-serif;
  font-weight:700;font-size:clamp(1.5rem,4vw,2.1rem);line-height:1.05;letter-spacing:.02em;
  color:#fff;text-transform:uppercase;}
.cs-acts{display:flex;flex-wrap:wrap;justify-content:center;gap:.6rem;}
.cs-btn{border:3px solid #454545;background:#000;color:#fff;padding:.6rem 1.4rem;
  font:inherit;font-weight:700;letter-spacing:.1em;font-size:14px;cursor:pointer;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.85);}
.cs-btn:hover{border-color:#ffd37f;color:#ffd37f;}
.cs-btn:active{border-color:#fff;color:#fff;}
.cs-btn:focus-visible{outline:2px solid #ffd37f;outline-offset:2px;}
.cs-btn-accent{border-color:#ffd37f;color:#ffd37f;}
.cs-btn-accent:hover{background:rgba(255,211,127,.14);}
.cs-meta{color:#5A5A63;font-size:11px;letter-spacing:.14em;
  font-family:var(--font-mono),ui-monospace,monospace;user-select:text;cursor:text;}
.cs-reason{margin:0;max-width:min(78ch,86vw);color:#E4645A;font-size:13px;line-height:1.45;
  font-family:var(--font-mono),ui-monospace,monospace;user-select:text;cursor:text;
  overflow-wrap:anywhere;}
.cs-diag{display:flex;flex-direction:column;align-items:center;gap:.75rem;width:100%;}
.cs-btn-small{padding:.35rem .9rem;font-size:11px;}
.cs-trace{margin:0;max-width:min(96ch,86vw);max-height:38vh;overflow:auto;text-align:left;
  padding:.75rem .9rem;border:3px solid #454545;background:#000;color:#9A9AA6;font-size:11px;
  line-height:1.5;font-family:var(--font-mono),ui-monospace,monospace;white-space:pre-wrap;
  overflow-wrap:anywhere;user-select:text;cursor:text;}
`;

/** a non-Error thrown value as text, without letting the stringify itself
 *  throw — a circular object or a hostile toString must not take out the
 *  screen that is reporting the last crash */
function safeString(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    try {
      return String(v);
    } catch {
      return "unprintable value";
    }
  }
}
