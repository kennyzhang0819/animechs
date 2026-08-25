"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import MapEditorView from "@/components/MapEditorView";
import {
  blankMap,
  deleteMap,
  drawThumb,
  generatedMap,
  listCustomMaps,
  loadMap,
  saveMap,
  type MapData,
} from "@/game/maps";

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

  const refresh = useCallback(() => {
    setMaps([generatedMap(), ...listCustomMaps()]);
  }, []);

  useEffect(refresh, [refresh]);

  // deep link: /admin?map=<id> opens straight into the editor
  useEffect(() => {
    setOpen(openId ? loadMap(openId) : null);
  }, [openId]);

  const openMap = (id: string): void => router.push(`/admin?map=${encodeURIComponent(id)}`);
  const closeMap = (): void => {
    router.push("/admin");
    refresh();
  };

  if (open) {
    return (
      <MapEditorView
        map={open}
        onClose={closeMap}
        onSaved={(storedId) => {
          // saving the generated template forks it — jump to the fork
          if (storedId !== open.id) openMap(storedId);
          else refresh();
        }}
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
              Debug tool. Ctrl+Shift+M toggles this page; custom maps live in localStorage.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const stored = saveMap(blankMap(`Blank ${new Date().toLocaleTimeString()}`));
                openMap(stored);
              }}
              className="rounded border border-[#2E6E4E] bg-[#12281E]/80 px-3 py-1.5 text-[#7BE0A8] hover:border-[#3E9E6E]"
            >
              + New blank map
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded border border-[#223050] px-3 py-1.5 text-[#9AA7C7] hover:border-[#35486E]"
            >
              Back to game
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => (
            <div
              key={m.id}
              className="group rounded-lg border border-[#223050] bg-[#0D1424]/70 p-3 transition-colors hover:border-[#35486E]"
            >
              <button onClick={() => openMap(m.id)} className="block w-full text-left">
                <Thumb map={m} />
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-semibold text-[#E8EDF7]">{m.name}</span>
                  <span className="text-[10px] uppercase tracking-widest text-[#5B6885]">
                    {m.id === "generated-24" ? "template" : "custom"}
                  </span>
                </div>
              </button>
              {m.id !== "generated-24" && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${m.name}"?`)) {
                      deleteMap(m.id);
                      refresh();
                    }
                  }}
                  className="mt-1 text-[11px] text-[#5B6885] hover:text-[#FF7A7A]"
                >
                  Delete
                </button>
              )}
            </div>
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
