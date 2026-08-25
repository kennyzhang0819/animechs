"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TARGET, UNIT_COUNTS } from "@/game/constants";
import { Game, type Stats } from "@/game/game";

const fmtCount = (n: number): string => `${n / 1000}k`;

export default function Swarmfield() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [target, setTarget] = useState<number>(DEFAULT_TARGET);
  const [stats, setStats] = useState<Stats>({
    units: 0,
    kills: 0,
    leaked: 0,
    simMs: 0,
    fps: 0,
    zoom: 1,
  });
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    if (!glRef.current || !uiRef.current) return;
    let alive = true;
    let game: Game | null = null;
    let hud: ReturnType<typeof setInterval> | undefined;
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
        hud = setInterval(() => setStats(g.stats()), 200);
      })
      .catch((err: unknown) => {
        if (alive) setWebglError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      alive = false;
      if (hud) clearInterval(hud);
      game?.destroy();
      gameRef.current = null;
    };
  }, []);

  const pickTarget = (n: number): void => {
    setTarget(n);
    gameRef.current?.setTarget(n);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-3.5 px-5 pt-4 pb-3">
        <h1 className="font-display text-[19px] font-semibold tracking-[0.16em] text-[#E8EDF7]">
          SWARMFIELD
        </h1>
        <span className="text-[#5B6885]">flow-field pathfinding &middot; webgl</span>

        <div role="group" aria-label="unit count" className="flex">
          {UNIT_COUNTS.map((n, i) => (
            <button
              key={n}
              onClick={() => pickTarget(n)}
              className={`border border-[#223050] px-2.5 py-[3px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8] ${
                i > 0 ? "-ml-px" : "rounded-l"
              } ${i === UNIT_COUNTS.length - 1 ? "rounded-r" : ""} ${
                target === n
                  ? "z-10 border-[#35486E] bg-[#16233E] text-[#E8EDF7]"
                  : "bg-[#0D1424] text-[#5B6885] hover:text-[#9AA7C7]"
              }`}
            >
              {fmtCount(n)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4 whitespace-nowrap tabular-nums">
          <Stat label="units" value={stats.units} />
          <Stat label="kills" value={stats.kills} />
          <Stat label="breached" value={stats.leaked} />
          <Stat label="sim" value={`${stats.simMs.toFixed(1)}ms`} />
          <Stat label="fps" value={stats.fps} />
          <button
            onClick={() => gameRef.current?.reset()}
            className="rounded border border-[#223050] bg-[#101828] px-3 py-[3px] tracking-[0.06em] text-[#9AA7C7] hover:border-[#35486E] hover:text-[#E8EDF7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5BD9E8]"
          >
            reset
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1320px] px-5">
        <div className="relative overflow-hidden rounded-md border border-[#1A2440] bg-[#0A101F]">
          {webglError ? (
            <p className="p-8 text-center text-[#9AA7C7]">{webglError}</p>
          ) : (
            <>
              <canvas ref={glRef} width={2560} height={1440} className="block h-auto w-full" />
              <canvas
                ref={uiRef}
                width={2560}
                height={1440}
                className="absolute inset-0 h-full w-full cursor-crosshair"
              />
            </>
          )}
        </div>
      </div>

      <p className="mx-auto w-full max-w-[1320px] px-5 pt-2.5 pb-5 text-[#5B6885]">
        <em className="not-italic text-[#9AA7C7]">Click the field to build a 2&times;2 tower.</em>{" "}
        Scroll to zoom, drag with right/middle mouse or WASD to pan. Towers block movement and the
        swarm re-routes around them in real time; the ghost turns red where you can&apos;t build —
        walls, the core, units underfoot, or a spot that would seal the swarm&apos;s last route.
        Sprites courtesy of Mindustry (GPL-3.0).
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      <span className="text-[#5B6885]">{label}</span>{" "}
      <b className="font-medium text-[#E8EDF7]">{value}</b>
    </span>
  );
}
