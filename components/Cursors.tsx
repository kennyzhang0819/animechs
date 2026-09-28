"use client";

import { useEffect } from "react";
import { applyCursors } from "@/game/cursorArt";
import { CURSOR_DEFAULT, loadProgress } from "@/game/progress";

/** Installs the drawn cursors (game/cursorArt.ts) from the save, and keeps the browser's own right-click menu off every screen but a text field. */
export default function Cursors() {
  useEffect(() => {
    applyCursors(loadProgress().cursor ?? CURSOR_DEFAULT);
    const onContext = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);
  return null;
}
