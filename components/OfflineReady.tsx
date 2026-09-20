"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker the static export ships with
 * (scripts/gen-sw.mjs) and reports the download, because the whole point of
 * the offline build is that the player knows the bundle is complete BEFORE
 * they leave the network. A silent cache is a cache you find out about on a
 * train. A short count is also the difference between "still going" and
 * "stalled", which a spinner cannot say.
 *
 * THE RELOAD IS NOT OPTIONAL. Shared memory needs the COOP/COEP headers the
 * worker adds, and a document's headers are fixed before any worker
 * controls the page, so the first load never had them. One reload once the
 * worker is in charge, guarded by a session flag so a page that still is
 * not isolated cannot loop.
 */
type State =
  | { at: "idle" }
  | { at: "caching"; done: number; total: number }
  | { at: "ready" }
  | { at: "partial"; done: number; total: number }
  | { at: "impossible"; why: string };

export default function OfflineReady() {
  const [state, setState] = useState<State>({ at: "idle" });

  useEffect(() => {
    /**
     * A SILENT FAILURE HERE IS THE WORST BUG THIS FILE CAN HAVE, and it
     * has already happened once: served from http://<LAN IP> there is no
     * `serviceWorker` at all — a service worker is secure-context only,
     * and only HTTPS and LOOPBACK count, so localhost works and the
     *192.168 address the tablet actually used does not. The page looked
     * perfectly fine, cached nothing, and was discovered on a train. So
     * the impossible case is the loudest thing on the screen, never a
     * silent return.
     */
    if (!("serviceWorker" in navigator)) {
      setState({
        at: "impossible",
        why: window.isSecureContext
          ? "this browser has no service worker"
          : `${window.location.protocol}//${window.location.hostname} is not a secure origin — needs https, or localhost`,
      });
      return;
    }
    let live = true;

    const onMessage = (e: MessageEvent) => {
      if (!live) return;
      const d = e.data as { type?: string; done?: number; total?: number; cached?: number };
      if (d?.type === "precache" && typeof d.done === "number" && typeof d.total === "number")
        setState(d.done >= d.total ? { at: "ready" } : { at: "caching", done: d.done, total: d.total });
      if (d?.type === "status" && typeof d.cached === "number" && typeof d.total === "number")
        setState(d.cached >= d.total ? { at: "ready" } : { at: "partial", done: d.cached, total: d.total });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    void (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
        if (!live) return;
        const reg = await navigator.serviceWorker.ready;
        if (!live) return;
        if (navigator.serviceWorker.controller && !crossOriginIsolated) {
          if (!sessionStorage.getItem("coi-reloaded")) {
            sessionStorage.setItem("coi-reloaded", "1");
            location.reload();
            return;
          }
        }
        // ask what is actually on disk rather than trusting that an install
        // we may not have watched ran to the end
        reg.active?.postMessage({ type: "status" });
      } catch {
        // no worker means no offline launch and nothing else — the game
        // itself does not care
      }
    })();

    return () => {
      live = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    // the failure and the warning STAY PUT; only the good news fades
    if (state.at !== "ready") return;
    const t = setTimeout(() => setState({ at: "idle" }), 8000);
    return () => clearTimeout(t);
  }, [state.at]);

  if (state.at === "idle") return null;
  const pct = state.at === "caching" || state.at === "partial"
    ? Math.floor((state.done / Math.max(1, state.total)) * 100)
    : 100;
  return (
    <div
      className="ui-zoom pointer-events-none fixed bottom-[0.375rem] left-[0.5rem] z-50 font-display text-[9px]"
      style={{
        color:
          state.at === "impossible"
            ? "#E5544B"
            : state.at === "partial"
              ? "#E0913F"
              : state.at === "ready"
                ? "#7BDFF2"
                : "#5A5A63",
      }}
    >
      {state.at === "caching" && `caching for offline  ${pct}%  (${state.done}/${state.total})`}
      {state.at === "ready" && "offline ready — safe to leave the network"}
      {state.at === "partial" && `offline INCOMPLETE — ${state.done}/${state.total}, reload on wi-fi`}
      {state.at === "impossible" && `OFFLINE UNAVAILABLE — ${state.why}`}
    </div>
  );
}
