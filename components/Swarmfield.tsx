"use client";

import { useEffect, useRef, useState } from "react";
import { Game, type UiState } from "@/game/game";
import { LEVELS, UNIT_KINDS, type LevelSpec, type TowerKind, type UnitKind } from "@/game/levels";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import { turretIcon } from "@/game/atlas";

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

/** the level card's map preview — the admin editor's thumbnail look */
function LevelThumb({ mapId }: { mapId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const m = loadMap(mapId);
    if (m && ref.current) drawThumb(m, ref.current);
  }, [mapId]);
  return (
    <canvas
      ref={ref}
      className="w-full rounded border border-[#2E2E36] [image-rendering:pixelated]"
    />
  );
}

/** what a level card advertises: how many waves, how many enemies total */
const levelSummary = (lv: LevelSpec): { waves: number; enemies: number } => {
  let waves = 0, enemies = 0;
  for (const step of lv.script) {
    if (!("wave" in step)) continue;
    let n = 0;
    for (const k of UNIT_KINDS) n += step.wave[k] ?? 0;
    if (n === 0) continue;
    waves++;
    enemies += n;
  }
  return { waves, enemies };
};

const TOWER_MENU: ReadonlyArray<{ kind: TowerKind; name: string; icon: string }> = [
  {
    kind: "duo",
    name: "Duo",
    icon: "/mindustry/sprites/blocks/turrets/duo/duo-preview.png",
  },
  {
    kind: "hail",
    name: "Hail",
    icon: "/mindustry/sprites/blocks/turrets/hail.png",
  },
  {
    kind: "salvo",
    name: "Salvo",
    icon: "/mindustry/sprites/blocks/turrets/salvo/salvo-preview.png",
  },
  {
    kind: "scatter",
    name: "Scatter",
    icon: "/mindustry/sprites/blocks/turrets/scatter/scatter-preview.png",
  },
  {
    kind: "fuse",
    name: "Fuse",
    icon: "/mindustry/sprites/blocks/turrets/fuse.png",
  },
];

export default function Swarmfield() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<UiState | null>(null);
  // menu icons with the block outline baked in, keyed by kind; the raw
  // sprite shows until its processed version resolves
  const [icons, setIcons] = useState<Partial<Record<TowerKind, string>>>({});
  const [webglError, setWebglError] = useState<string | null>(null);
  // the level selector is the entrance: no Game exists until a level is
  // picked, and going back to the menu tears the whole game down
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [levelIdx, setLevelIdx] = useState(0);
  // the selector draws map previews, so the documents load with the menu —
  // Game.create re-fetches later, keeping in-game state just as fresh
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadOfficialMaps()
      .then(() => {
        if (alive) setMapsReady(true);
      })
      .catch(() => {}); // cards fall back to text-only; the game will retry
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (screen !== "game" || !glRef.current || !uiRef.current) return;
    let alive = true;
    let game: Game | null = null;
    Game.create(glRef.current, uiRef.current)
      .then((g) => {
        if (!alive) {
          g.destroy();
          return;
        }
        g.loadLevel(LEVELS[levelIdx]);
        game = g;
        gameRef.current = g;
        setHud(g.ui());
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as Record<string, unknown>).__swarmfield = g;
        }
      })
      .catch((err: unknown) => {
        if (alive) setWebglError(err instanceof Error ? err.message : String(err));
      });
    // mode changes can also happen in-game (escape, right-click cancel)
    const poll = setInterval(() => {
      if (gameRef.current) setHud(gameRef.current.ui());
    }, 100);
    return () => {
      alive = false;
      clearInterval(poll);
      game?.destroy();
      gameRef.current = null;
      setHud(null);
      // drop the debug global too — a stale pointer to a destroyed Game
      // makes console probing silently act on the wrong instance
      const w = window as unknown as Record<string, unknown>;
      if (w.__swarmfield === game) delete w.__swarmfield;
    };
  }, [screen, levelIdx]);

  useEffect(() => {
    let alive = true;
    Promise.all(
      TOWER_MENU.map(async (t) => [t.kind, await turretIcon(t.icon)] as const),
    ).then((entries) => {
      if (alive) setIcons(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, []);

  const pickTower = (kind: TowerKind): void => {
    const g = gameRef.current;
    if (!g) return;
    const next = hud?.buildKind === kind ? null : kind;
    g.setBuildKind(next);
    setHud(g.ui());
  };

  if (webglError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#101013]">
        <p className="p-8 text-center text-[#A6A6AF]">{webglError}</p>
      </div>
    );
  }

  if (screen === "menu") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-10 overflow-hidden bg-[#101013]">
        <h1 className="text-4xl font-bold uppercase tracking-[0.35em] text-[#EDEDEF]">
          Swarmdustry
        </h1>
        <div role="group" aria-label="level select" className="flex flex-wrap justify-center gap-4">
          {LEVELS.map((lv, i) => {
            const { waves, enemies } = levelSummary(lv);
            return (
              <button
                key={lv.id}
                onClick={() => {
                  setLevelIdx(i);
                  setScreen("game");
                }}
                className="w-72 rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-3 text-left transition-colors hover:border-[#FFD37F] hover:bg-[#222227]/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
              >
                {mapsReady && <LevelThumb mapId={lv.map ?? OFFICIAL_MAP_IDS[0]} />}
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-base font-semibold text-[#EDEDEF]">{lv.name}</span>
                  <span className="text-[11px] uppercase tracking-widest text-[#71717C]">
                    {waves} waves · {enemies} enemies
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="absolute bottom-4 left-0 right-0 text-center text-[11px] uppercase tracking-widest text-[#71717C]">
          A personal project by Zerkka — all units, art, and inspiration come from{" "}
          <a
            href="https://mindustrygame.github.io/"
            target="_blank"
            rel="noreferrer"
            className="text-[#A6A6AF] underline decoration-[#4A4A55] underline-offset-2 hover:text-[#EDEDEF]"
          >
            Mindustry
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div className="relative h-full w-full">
        <canvas ref={glRef} width={2560} height={1440} className="block h-full w-full" />
        <canvas
          ref={uiRef}
          width={2560}
          height={1440}
          className={`absolute inset-0 h-full w-full ${
            hud?.buildKind ? "cursor-crosshair" : "cursor-default"
          }`}
        />
        {hud?.paused && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded border border-[#E8B45B] bg-[#151518]/70 px-3 py-1.5 text-sm font-semibold uppercase tracking-widest text-[#E8B45B] backdrop-blur">
            Paused
          </div>
        )}
        {hud && (
          <div className="absolute left-4 top-4 max-w-[calc(100vw-2rem)] rounded border border-[#2E2E36] bg-[#151518]/70 px-3 py-1.5 backdrop-blur">
            <div className="text-[11px] uppercase tracking-widest text-[#71717C]">
              Wave {hud.currentWave} / {hud.totalWaves}
            </div>
            {hud.remaining > 0 ? (
              // icon + count only; wraps rather than running off the viewport
              // once a level fields more kinds than fit on one line
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-[#EDEDEF]">
                {UNIT_KINDS.map(
                  (k, i) =>
                    hud.byKind[i] > 0 && (
                      <span key={k} className="flex items-center gap-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                        <img
                          src={unitIcon(k)}
                          alt={k}
                          className="h-5 w-5 shrink-0 [image-rendering:pixelated]"
                        />
                        {hud.byKind[i]}
                      </span>
                    ),
                )}
              </div>
            ) : (
              <div className="text-sm font-semibold text-[#EDEDEF]">Level cleared!</div>
            )}
            {hud.nextWaveIn > 0 && (
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#71717C]">
                <span>
                  Next wave{" "}
                  <span className="font-semibold text-[#EDEDEF]">
                    {Math.ceil(hud.nextWaveIn)}
                  </span>
                </span>
                <button
                  title="Start next wave now"
                  aria-label="Start next wave now"
                  onClick={() => gameRef.current?.skipWave()}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#2E2E36] text-[#FFD37F] hover:border-[#FFD37F] hover:bg-[#222227]/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3 fill-current" aria-hidden="true">
                    <path d="M2.5 1.5v9l8-4.5z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}
        <div
          role="group"
          aria-label="tower menu"
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2"
        >
          {TOWER_MENU.map((t) => (
            <button
              key={t.kind}
              title={t.name}
              aria-pressed={hud?.buildKind === t.kind}
              onClick={() => pickTower(t.kind)}
              className={`flex h-14 w-14 items-center justify-center rounded border backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                hud?.buildKind === t.kind
                  ? "border-[#FFD37F] bg-[#222227]/90"
                  : "border-[#2E2E36] bg-[#151518]/70 hover:border-[#4A4A55]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
              <img
                src={icons[t.kind] ?? t.icon}
                alt={t.name}
                className="h-10 w-10 [image-rendering:pixelated]"
              />
            </button>
          ))}
        </div>
        {hud?.lost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-80 rounded border border-[#3A2430] bg-[#151518]/95 p-6 text-center">
              <div className="text-lg font-bold uppercase tracking-widest text-[#FF5A5A]">
                Core destroyed
              </div>
              <div className="mt-4 space-y-1 text-sm text-[#A6A6AF]">
                <div>
                  Reached wave{" "}
                  <span className="font-semibold text-[#EDEDEF]">{hud.currentWave}</span> of{" "}
                  {hud.totalWaves}
                </div>
                <div>
                  Kills <span className="font-semibold text-[#EDEDEF]">{hud.kills}</span>
                </div>
              </div>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => {
                    const g = gameRef.current;
                    if (!g) return;
                    g.reset();
                    setHud(g.ui());
                  }}
                  className="rounded border border-[#FFD37F] bg-[#222227]/90 px-5 py-2 text-sm font-semibold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Retry
                </button>
                <button
                  onClick={() => setScreen("menu")}
                  className="rounded border border-[#2E2E36] px-5 py-2 text-sm font-semibold uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55] hover:bg-[#222227]/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Levels
                </button>
              </div>
            </div>
          </div>
        )}
        {hud?.won && !hud.lost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-80 rounded border border-[#1F3A2E] bg-[#151518]/95 p-6 text-center">
              <div className="text-lg font-bold uppercase tracking-widest text-[#7BE58A]">
                Level cleared
              </div>
              <div className="mt-4 space-y-1 text-sm text-[#A6A6AF]">
                <div>
                  Waves survived{" "}
                  <span className="font-semibold text-[#EDEDEF]">{hud.totalWaves}</span> of{" "}
                  {hud.totalWaves}
                </div>
                <div>
                  Kills <span className="font-semibold text-[#EDEDEF]">{hud.kills}</span>
                </div>
              </div>
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setScreen("menu")}
                  className="rounded border border-[#7BE58A] bg-[#14271C]/90 px-6 py-2 text-sm font-semibold uppercase tracking-widest text-[#7BE58A] hover:bg-[#1A3324] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7BE58A]"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
        {hud?.menuOpen && !hud.lost && !hud.won && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-72 rounded border border-[#2E2E36] bg-[#151518]/95 p-6 text-center">
              <div className="text-lg font-bold uppercase tracking-widest text-[#EDEDEF]">
                Game menu
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={() => {
                    const g = gameRef.current;
                    if (!g) return;
                    g.closeMenu();
                    setHud(g.ui());
                  }}
                  className="rounded border border-[#FFD37F] bg-[#222227]/90 px-5 py-2 text-sm font-semibold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Resume
                </button>
                <button
                  onClick={() => setScreen("menu")}
                  className="rounded border border-[#3A2430] px-5 py-2 text-sm font-semibold uppercase tracking-widest text-[#FF8A8A] hover:border-[#FF5A5A] hover:bg-[#2A1620]/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF5A5A]"
                >
                  Abandon level
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
