"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import MapEditorView from "@/components/MapEditorView";
import { drawThumb, loadOfficialMaps, type MapData } from "@/game/maps";

function Thumb({ map }: { map: MapData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawThumb(map, ref.current);
  }, [map]);
  return (
    <canvas
      ref={ref}
      className="w-full rounded border border-[#223050] [image-rendering:pixelated]"
    />
  );
}

function AdminInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("map");
  const [maps, setMaps] = useState<MapData[]>([]);
  const [open, setOpen] = useState<MapData | null>(null);

  // the documents live in public/maps/ and are fetched, not imported
  useEffect(() => {
    let alive = true;
    loadOfficialMaps().then((loaded) => {
      if (alive) setMaps([...loaded]);
    });
    return () => {
      alive = false;
    };
  }, []);

  // deep link: /admin?map=<id> opens straight into the editor
  useEffect(() => {
    setOpen(maps.find((m) => m.id === openId) ?? null);
  }, [openId, maps]);

  if (open) {
    return (
      <MapEditorView
        map={open}
        onClose={() => router.push("/admin")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#070B14] p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#E8EDF7]">Maps — admin</h1>
            <p className="text-[#5B6885]">
              Debug tool. Ctrl+Shift+M toggles this page; saving writes the map&apos;s JSON in
              game/maps/ — edits ARE the official map.
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="rounded border border-[#223050] px-3 py-1.5 text-[#9AA7C7] hover:border-[#35486E]"
          >
            Back to game
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => (
            <button
              key={m.id}
              onClick={() => router.push(`/admin?map=${encodeURIComponent(m.id)}`)}
              className="rounded-lg border border-[#223050] bg-[#0D1424]/70 p-3 text-left transition-colors hover:border-[#35486E]"
            >
              <Thumb map={m} />
              <div className="mt-2 flex items-baseline justify-between">
                <span className="font-semibold text-[#E8EDF7]">{m.name}</span>
                <span className="text-[10px] uppercase tracking-widest text-[#5B6885]">
                  official
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminInner />
    </Suspense>
  );
}
