"use client";

import { useEffect, useState } from "react";
import CrashScreen from "@/components/CrashScreen";

/**
 * THE CATCH-ALL, mounted once in the root layout.
 *
 * A React error boundary (app/error.tsx) only ever sees a throw that
 * happens while React is rendering. The game does not run there — it owns
 * its own rAF loop, its own event listeners and its own async loads — so
 * nearly every real crash lands on `window.onerror` or on an unhandled
 * rejection, where by default NOTHING happens: the loop dies, the canvas
 * freezes on its last frame, and the player is left clicking at a picture.
 *
 * This listens for both and puts the fault screen over the whole app.
 */

/** noise that is not a crash: a dead <img>, a cross-origin script whose
    message the browser will not hand over, the ResizeObserver notice every
    browser emits, and an abort the player caused by navigating away */
function isNoise(message: string, err: unknown, target: EventTarget | null): boolean {
  if (target && target !== window) return true; // a failed element load, not a throw
  if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError"))
    return true;
  return (
    message === "" ||
    /^script error\.?$/i.test(message) ||
    /resizeobserver loop/i.test(message) ||
    /^(the )?(play\(\) )?request (was|is) (interrupted|not allowed)/i.test(message)
  );
}

export default function CrashGuard(): React.JSX.Element | null {
  const [crash, setCrash] = useState<unknown>(undefined);

  useEffect(() => {
    // ONLY THE FIRST ONE COUNTS. A loop that throws throws every frame at
    // 60Hz; the fault screen shows what stopped the machine first and the
    // rest go to the console.
    let seen = false;
    const fire = (err: unknown): void => {
      if (seen) return;
      seen = true;
      setCrash(err ?? new Error("unspecified failure"));
    };

    const onError = (e: ErrorEvent): void => {
      if (isNoise(e.message ?? "", e.error, e.target)) return;
      fire(e.error ?? new Error(e.message));
    };
    const onReject = (e: PromiseRejectionEvent): void => {
      const r: unknown = e.reason;
      const msg = r instanceof Error ? r.message : String(r ?? "");
      if (isNoise(msg, r, null)) return;
      fire(r instanceof Error ? r : new Error(msg));
    };

    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onReject);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onReject);
    };
  }, []);

  if (crash === undefined) return null;
  // there is no retrying a loop that has already died mid-frame — the only
  // honest restart is a fresh document
  return <CrashScreen error={crash} onRetry={() => window.location.reload()} />;
}
