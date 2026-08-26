"use client";

import { useEffect, useRef, useState } from "react";
import { Game, type UiState } from "@/game/game";
import { UNIT_KINDS, type TowerKind, type UnitKind } from "@/game/levels";
import { turretIcon } from "@/game/atlas";

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

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

  useEffect(() => {
    if (!glRef.current || !uiRef.current) return;
    let alive = true;
    let game: Game | null = null;
    Game.create(glRef.current, uiRef.current)
      .then((g) => {
        if (!alive) {
          g.destroy();
          return;
        }
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
    };
  }, []);

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
      <div className="fixed inset-0 flex items-center justify-center bg-[#0A101F]">
        <p className="p-8 text-center text-[#9AA7C7]">{webglError}</p>
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
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded border border-[#E8B45B] bg-[#0D1424]/70 px-3 py-1.5 text-sm font-semibold uppercase tracking-widest text-[#E8B45B] backdrop-blur">
            Paused
          </div>
        )}
        {hud && (
          <div className="absolute left-4 top-4 max-w-[calc(100vw-2rem)] rounded border border-[#223050] bg-[#0D1424]/70 px-3 py-1.5 backdrop-blur">
            <div className="text-[11px] uppercase tracking-widest text-[#5B6885]">
              Wave {hud.currentWave} / {hud.totalWaves}
            </div>
            {hud.remaining > 0 ? (
              // icon + count only; wraps rather than running off the viewport
              // once a level fields more kinds than fit on one line
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-[#E8EDF7]">
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
              <div className="text-sm font-semibold text-[#E8EDF7]">Level cleared!</div>
            )}
            {hud.nextWaveIn > 0 && (
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#5B6885]">
                <span>
                  Next wave{" "}
                  <span className="font-semibold text-[#E8EDF7]">
                    {Math.ceil(hud.nextWaveIn)}
                  </span>
                </span>
                <button
                  title="Start next wave now"
                  aria-label="Start next wave now"
                  onClick={() => gameRef.current?.skipWave()}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#223050] text-[#5BD9E8] hover:border-[#5BD9E8] hover:bg-[#16233E]/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8]"
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
              className={`flex h-14 w-14 items-center justify-center rounded border backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8] ${
                hud?.buildKind === t.kind
                  ? "border-[#5BD9E8] bg-[#16233E]/90"
                  : "border-[#223050] bg-[#0D1424]/70 hover:border-[#35486E]"
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
      </div>
    </div>
  );
}
