"use client";

import { useEffect, useRef, useState } from "react";
import { Game, type UiState } from "@/game/game";
import type { TowerKind } from "@/game/levels";

const TOWER_MENU: ReadonlyArray<{ kind: TowerKind; name: string; icon: string }> = [
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
];

export default function Swarmfield() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<UiState | null>(null);
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
        {hud && (
          <div className="absolute left-4 top-4 rounded border border-[#223050] bg-[#0D1424]/70 px-3 py-1.5 backdrop-blur">
            <div className="text-[11px] uppercase tracking-widest text-[#5B6885]">
              Level {hud.levelId}
            </div>
            <div className="text-sm font-semibold text-[#E8EDF7]">
              {hud.remaining > 0 ? `Kill ${hud.remaining} enemies` : "Level cleared!"}
            </div>
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
                src={t.icon}
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
