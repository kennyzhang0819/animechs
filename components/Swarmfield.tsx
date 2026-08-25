"use client";

import { useEffect, useRef, useState } from "react";
import { Game, type UiState } from "@/game/game";
import { UNIT_KINDS, type TowerKind, type UnitKind } from "@/game/levels";

// HUD labels and icons per unit kind ("mace" is its own plural)
const UNIT_LABEL: Record<UnitKind, readonly [string, string]> = {
  dagger: ["dagger", "daggers"],
  mace: ["mace", "mace"],
  flare: ["flare", "flares"],
};
const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

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
        {hud?.paused && (
          <div className="absolute left-4 top-[4.75rem] flex items-center gap-2 rounded border border-[#E8B45B] bg-[#0D1424]/70 px-3 py-1.5 backdrop-blur">
            <span className="text-sm font-semibold uppercase tracking-widest text-[#E8B45B]">
              Paused
            </span>
            <span className="text-[11px] text-[#9AA7C7]">space to resume</span>
          </div>
        )}
        {hud && (
          <div className="absolute left-4 top-4 rounded border border-[#223050] bg-[#0D1424]/70 px-3 py-1.5 backdrop-blur">
            <div className="text-[11px] uppercase tracking-widest text-[#5B6885]">
              Level {hud.levelId}
            </div>
            {hud.remaining > 0 ? (
              <div className="flex items-center gap-3 text-sm font-semibold text-[#E8EDF7]">
                <span className="font-normal text-[#9AA7C7]">Remaining:</span>
                {UNIT_KINDS.map(
                  (k, i) =>
                    hud.byKind[i] > 0 && (
                      <span key={k} className="flex items-center gap-1.5">
                        {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                        <img
                          src={unitIcon(k)}
                          alt={k}
                          className="h-5 w-5 [image-rendering:pixelated]"
                        />
                        {hud.byKind[i]}{" "}
                        <span className="font-normal text-[#9AA7C7]">
                          {UNIT_LABEL[k][hud.byKind[i] === 1 ? 0 : 1]}
                        </span>
                      </span>
                    ),
                )}
              </div>
            ) : (
              <div className="text-sm font-semibold text-[#E8EDF7]">Level cleared!</div>
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
