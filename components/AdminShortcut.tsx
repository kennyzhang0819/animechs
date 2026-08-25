"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Global debug shortcut, registered once in the root layout:
 * Ctrl+Shift+M toggles the map-editor admin page from anywhere.
 */
export default function AdminShortcut() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // ctrl OR cmd — though Chrome on Mac reserves Cmd+Shift+M for profile
      // switching, so Ctrl+Shift+M is the combination that always arrives
      if ((!e.ctrlKey && !e.metaKey) || !e.shiftKey || e.code !== "KeyM") return;
      e.preventDefault();
      router.push(pathname.startsWith("/admin") ? "/" : "/admin");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pathname]);

  return null;
}
