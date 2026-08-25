"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TARGET, UNIT_COUNTS } from "@/game/constants";
import { Game } from "@/game/game";

const fmtCount = (n: number): string => `${n / 1000}k`;

export default function Swarmfield() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [target, setTarget] = useState<number>(DEFAULT_TARGET);
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
        if (process.env.NODE_ENV !== "production") {
          (window as unknown as Record<string, unknown>).__swarmfield = g;
        }
      })
      .catch((err: unknown) => {
        if (alive) setWebglError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
      game?.destroy();
      gameRef.current = null;
    };
  }, []);

  const pickTarget = (n: number): void => {
    setTarget(n);
    gameRef.current?.setTarget(n);
  };

  if (webglError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0A101F]">
        <p className="p-8 text-center text-[#9AA7C7]">{webglError}</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div
        className="relative max-h-full w-full"
        style={{ aspectRatio: "16 / 9", maxWidth: "calc(100vh * 16 / 9)" }}
      >
        <canvas ref={glRef} width={2560} height={1440} className="block h-full w-full" />
        <canvas
          ref={uiRef}
          width={2560}
          height={1440}
          className="absolute inset-0 h-full w-full cursor-crosshair"
        />
        <div role="group" aria-label="unit count" className="absolute left-4 top-4 flex">
          {UNIT_COUNTS.map((n, i) => (
            <button
              key={n}
              onClick={() => pickTarget(n)}
              className={`border border-[#223050] px-2.5 py-[3px] backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8] ${
                i > 0 ? "-ml-px" : "rounded-l"
              } ${i === UNIT_COUNTS.length - 1 ? "rounded-r" : ""} ${
                target === n
                  ? "z-10 border-[#35486E] bg-[#16233E]/90 text-[#E8EDF7]"
                  : "bg-[#0D1424]/70 text-[#5B6885] hover:text-[#9AA7C7]"
              }`}
            >
              {fmtCount(n)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
