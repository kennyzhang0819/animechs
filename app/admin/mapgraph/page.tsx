"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MapGraphEditor from "@/components/MapGraphEditor";
import { ADMIN_ENABLED } from "@/game/env";

/**
 * /admin/mapgraph — the map graph editor, on its own route rather than as
 * a tab of /admin because it edits a DIFFERENT THING: the map editor
 * paints a finished document (and a hand edit lives until the spec is run
 * again), while this draws the spec the document is generated from.
 *
 * THE PAGE IS THE VIEWPORT. The board is the work, so it takes every
 * pixel the panel does not: the header is one line, the shell never
 * scrolls, and the editor sizes its own square to what is left.
 */
function MapGraphInner() {
  const router = useRouter();
  // /admin/mapgraph?id=<map> opens straight onto that map's graph, which
  // is the door on its card in the admin map list
  const id = useSearchParams().get("id") ?? undefined;
  if (!ADMIN_ENABLED)
    return <main className="p-8 text-[#8A8A96]">The map graph editor is a development tool.</main>;
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#0B0B0E]">
      <header className="flex shrink-0 items-baseline gap-3 border-b border-[#2E2E36] px-3 py-1.5">
        <h1 className="text-[13px] font-medium text-[#D8D8E0]">Map graph</h1>
        <p className="flex-1 truncate text-[11px] text-[#7A7A86]">
          Rooms, roads and chokes; the generator makes the terrain and the spawn tiles are
          painted afterwards. Save writes scripts/maps/graphs/&lt;id&gt;.json and
          scripts/maps/&lt;id&gt;.mjs.
        </p>
        <button
          onClick={() => router.push("/admin")}
          className="shrink-0 rounded border border-[#2E2E36] px-2 py-0.5 text-[11px] text-[#A6A6AF] hover:border-[#4A4A55]"
        >
          Admin
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <MapGraphEditor openId={id} />
      </div>
    </main>
  );
}

export default function MapGraphPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#0B0B0E]" />}>
      <MapGraphInner />
    </Suspense>
  );
}
