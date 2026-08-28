"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import LevelEditorView from "@/components/LevelEditorView";
import MapEditorView from "@/components/MapEditorView";
import { loadLevelDocs, WORLDS, waveGroups, type LevelSpec } from "@/game/levels";
import { drawThumb, loadOfficialMaps, OFFICIAL_MAP_IDS, type MapData } from "@/game/maps";

function Thumb({ map }: { map: MapData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawThumb(map, ref.current);
  }, [map]);
  return (
    <canvas
      ref={ref}
      className="w-full rounded border border-[#2E2E36] [image-rendering:pixelated]"
    />
  );
}

/** one level's entry point: what the script currently holds, at a glance */
function LevelCard({
  level,
  ready,
  onOpen,
}: {
  level: LevelSpec;
  /** documents have landed — until then the counts are the shipped script */
  ready: boolean;
  onOpen: () => void;
}) {
  let waves = 0;
  let enemies = 0;
  const regions = new Set<number>();
  for (const step of level.script) {
    if (!("wave" in step)) continue;
    let n = 0;
    for (const g of waveGroups(step.wave)) {
      for (const c of g.counts) n += c;
      if (g.region > 0) regions.add(g.region);
    }
    if (n === 0) continue;
    waves++;
    enemies += n;
  }
  return (
    <button
      onClick={onOpen}
      disabled={!ready}
      className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3 text-left transition-colors hover:border-[#4A4A55] disabled:opacity-50"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-bold text-[#EDEDEF]">{level.name}</span>
        <span className="text-[12px] uppercase tracking-widest text-[#71717C]">
          {level.map ?? OFFICIAL_MAP_IDS[0]}
        </span>
      </div>
      <div className="mt-1 text-[13px] uppercase tracking-widest text-[#71717C]">
        {waves} waves · {enemies} enemies · {level.waveGap}s gap
      </div>
      <div className="mt-1 text-[13px] text-[#71717C]">
        {regions.size > 0
          ? `regions ${[...regions].sort((a, b) => a - b).join(", ")}`
          : "any pad"}
      </div>
    </button>
  );
}

function AdminInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("map");
  const openLevel = params.get("level");
  const [maps, setMaps] = useState<MapData[]>([]);
  const [open, setOpen] = useState<MapData | null>(null);
  // level documents overlay WORLDS in place, so this is a "have they landed
  // yet" flag rather than a piece of state — the editor must not open on the
  // shipped script and then save that over someone's earlier edits
  const [levelsReady, setLevelsReady] = useState(false);

  // the documents live in public/maps/ and public/levels/ and are fetched,
  // not imported
  useEffect(() => {
    let alive = true;
    loadOfficialMaps().then((loaded) => {
      if (alive) setMaps([...loaded]);
    });
    loadLevelDocs().then(() => {
      if (alive) setLevelsReady(true);
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

  // the map documents matter too: the level editor draws the spawn-region
  // key from the level's map, so hold the editor until both have landed
  if (openLevel && levelsReady && maps.length > 0) {
    const level = WORLDS.find((w) => w.id === openLevel);
    if (level)
      return <LevelEditorView level={level} onClose={() => router.push("/admin")} />;
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#EDEDEF]">Admin</h1>
            <p className="text-[#71717C]">
              Debug tool. Ctrl+Shift+M toggles this page. Map edits write public/maps/&lt;id&gt;.json
              and ARE the official map; level edits write public/levels/&lt;id&gt;.json and override
              the shipped script.
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="rounded border border-[#2E2E36] px-3 py-1.5 text-[#A6A6AF] hover:border-[#4A4A55]"
          >
            Back to game
          </button>
        </div>

        <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
          Levels — wave composition
        </h2>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WORLDS.map((w) => (
            <LevelCard
              key={w.id}
              level={w}
              ready={levelsReady}
              onOpen={() => router.push(`/admin?level=${encodeURIComponent(w.id)}`)}
            />
          ))}
        </div>

        <h2 className="mb-3 text-[12px] font-bold uppercase tracking-widest text-[#71717C]">
          Maps — terrain and spawn pads
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => (
            <button
              key={m.id}
              onClick={() => router.push(`/admin?map=${encodeURIComponent(m.id)}`)}
              className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3 text-left transition-colors hover:border-[#4A4A55]"
            >
              <Thumb map={m} />
              <div className="mt-2 flex items-baseline justify-between">
                <span className="font-bold text-[#EDEDEF]">{m.name}</span>
                <span className="text-[12px] uppercase tracking-widest text-[#71717C]">
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
