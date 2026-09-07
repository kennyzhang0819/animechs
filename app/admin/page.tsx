"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import BalanceView from "@/components/BalanceView";
import { loadBalanceDoc } from "@/game/balance";
import { ADMIN_ENABLED } from "@/game/env";
import LevelEditorView from "@/components/LevelEditorView";
import MapEditorView from "@/components/MapEditorView";
import SandboxView from "@/components/SandboxView";
import {
  loadLevelDocs,
  UNIT_KINDS,
  UNIT_STATS,
  WORLDS,
  waveGroups,
  type LevelSpec,
} from "@/game/levels";
import { MOVE_LAYERS, type MoveLayer } from "@/game/constants";
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

/**
 * What a level's script currently holds, at a glance. This is a reading of
 * the script rather than a component because the map card renders it: a
 * level and the map it is played on are one thing to edit, not two, so
 * there is one card and it carries both.
 */
function levelStats(level: LevelSpec) {
  let waves = 0;
  let enemies = 0;
  // WHICH MOVEMENT LAYERS THIS SCRIPT SENDS — what the card reports now
  // that no wave names a spawn region. The old line listed the region ids a
  // script pinned its groups to; a unit's layer picks its door on its own,
  // so what is worth knowing at a glance is which kinds of door the level
  // is going to need the map to have.
  const layers = new Set<MoveLayer>();
  for (const step of level.script) {
    if (!("wave" in step)) continue;
    let n = 0;
    for (const g of waveGroups(step.wave))
      g.counts.forEach((c, i) => {
        if (c <= 0) return;
        n += c;
        const s = UNIT_STATS[UNIT_KINDS[i]];
        layers.add(s.flying ? "air" : s.naval ? "water" : "ground");
      });
    if (n === 0) continue;
    waves++;
    enemies += n;
  }
  return { waves, enemies, layers };
}

/**
 * ONE CARD PER MAP, carrying both doors. A map and the level played on it
 * were two lists that had to be read side by side to answer one question —
 * "what is on this map, and what does it send?" — so they are one card with
 * two buttons. A map no world names keeps the card and loses the level
 * button; nothing here can open a level editor onto a map that has no level.
 */
function MapCard({
  map,
  level,
  ready,
  onEditMap,
  onEditLevel,
}: {
  map: MapData;
  /** the world played on this map, if any */
  level?: LevelSpec;
  /** level documents have landed — until then the counts are the shipped script */
  ready: boolean;
  onEditMap: () => void;
  onEditLevel: () => void;
}) {
  const stats = level ? levelStats(level) : null;
  return (
    <div className="rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3">
      <Thumb map={map} />
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="font-bold text-[#EDEDEF]">{map.name}</span>
        <span className="shrink-0 text-[14px] uppercase tracking-widest text-[#71717C]">
          {map.id}
        </span>
      </div>
      <div className="mt-1 min-h-[34px] text-[15px] text-[#71717C]">
        {stats ? (
          <>
            <div className="uppercase tracking-widest">
              {stats.waves} waves · {stats.enemies} enemies · {level!.waveGap}s gap
            </div>
            <div>
              {stats.layers.size > 0
                ? [...MOVE_LAYERS].filter((l) => stats.layers.has(l)).join(" · ")
                : "no units"}
            </div>
          </>
        ) : (
          <div className="uppercase tracking-widest">no level — terrain only</div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onEditMap}
          className="flex-1 rounded border border-[#2E2E36] px-3 py-1.5 text-[15px] font-bold text-[#A6A6AF] transition-colors hover:border-[#4A4A55] hover:text-[#EDEDEF]"
        >
          Edit map
        </button>
        <button
          onClick={onEditLevel}
          disabled={!level || !ready}
          className="flex-1 rounded border border-[#2E2E36] px-3 py-1.5 text-[15px] font-bold text-[#A6A6AF] transition-colors hover:border-[#4A4A55] hover:text-[#EDEDEF] disabled:opacity-40 disabled:hover:border-[#2E2E36] disabled:hover:text-[#A6A6AF]"
        >
          Edit level
        </button>
      </div>
    </div>
  );
}

function AdminInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("map");
  const openLevel = params.get("level");
  // the tab lives in the URL like the editors do, so a reload lands back
  // where you were mid-tune
  const raw = params.get("tab");
  const tab =
    raw === "balance" || raw === "sandbox" ? raw : "content";
  const [maps, setMaps] = useState<MapData[]>([]);
  const [open, setOpen] = useState<MapData | null>(null);
  // level documents overlay WORLDS in place, so this is a "have they landed
  // yet" flag rather than a piece of state — the editor must not open on the
  // shipped script and then save that over someone's earlier edits
  const [levelsReady, setLevelsReady] = useState(false);
  // and the same for the balance document: the tab must not open on the
  // authored coefficients and then save those over what is on disk
  const [balanceReady, setBalanceReady] = useState(false);

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
    loadBalanceDoc().then(() => {
      if (alive) setBalanceReady(true);
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
              and ARE the official map; level edits write public/levels/campaign.json — the one
              wave script every map plays, re-cast per deploy into the families the die rolls; balance edits
              write public/balance.json and override the authored tuning coefficients.
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="rounded border border-[#2E2E36] px-3 py-1.5 text-[#A6A6AF] hover:border-[#4A4A55]"
          >
            Back to game
          </button>
        </div>

        <div className="mb-6 flex gap-1 border-b border-[#2E2E36]">
          {([
            ["content", "Levels & maps"],
            ["balance", "Balance"],
            ["sandbox", "Sandbox"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => router.push(id === "content" ? "/admin" : `/admin?tab=${id}`)}
              className={`-mb-px border-b-2 px-4 py-2 text-[15px] font-bold transition-colors ${
                tab === id
                  ? "border-[#EDEDEF] text-[#EDEDEF]"
                  : "border-transparent text-[#71717C] hover:text-[#A6A6AF]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "sandbox" &&
          (levelsReady ? (
            <SandboxView />
          ) : (
            <p className="text-[#71717C]">Reading the level documents…</p>
          ))}

        {tab === "balance" &&
          (balanceReady ? (
            <BalanceView />
          ) : (
            <p className="text-[#71717C]">Reading public/balance.json…</p>
          ))}

        {tab === "content" && (
          <>
        <h2 className="mb-3 text-[14px] font-bold uppercase tracking-widest text-[#71717C]">
          Maps — terrain, spawn pads and wave composition
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => {
            const level = WORLDS.find((w) => (w.map ?? OFFICIAL_MAP_IDS[0]) === m.id);
            return (
              <MapCard
                key={m.id}
                map={m}
                level={level}
                ready={levelsReady}
                onEditMap={() => router.push(`/admin?map=${encodeURIComponent(m.id)}`)}
                onEditLevel={() =>
                  level && router.push(`/admin?level=${encodeURIComponent(level.id)}`)
                }
              />
            );
          })}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  // the editors save through dev-only API routes, so in a production build
  // this page is a door onto nothing — say so instead of opening it
  if (!ADMIN_ENABLED)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#101013] px-6 text-center">
        <p className="text-[15px] uppercase tracking-widest text-[#71717C]">
          The editors are a development tool —{" "}
          <a href="/" className="text-[#FFD37F] underline">
            back to the game
          </a>
        </p>
      </div>
    );
  return (
    <Suspense fallback={null}>
      <AdminInner />
    </Suspense>
  );
}
