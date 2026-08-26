"use client";

import { useEffect, useRef, useState } from "react";
import { Game, type UiState } from "@/game/game";
import { UNIT_KINDS, type LevelSpec, type TowerKind, type UnitKind } from "@/game/levels";
import { grantRunReward, type RunReward } from "@/game/progress";
import type { TechState } from "@/game/tech";
import { TOWERS } from "@/game/constants";
import { TOWER_KINDS } from "@/game/types";
import { turretIcon } from "@/game/atlas";
import { SCRAP_ICON, TOWER_ICONS } from "./towerIcons";

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

export default function Swarmfield({
  level,
  tech,
  onExit,
}: {
  level: LevelSpec;
  /** the save's tower unlocks and caps, applied to the sim's placement rules */
  tech: TechState;
  /** back to the level select — the shell reloads the save on the way out */
  onExit: () => void;
}) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<UiState | null>(null);
  // the settled payout of a finished run; non-null exactly while the
  // results overlay is up, and the guard against double-granting
  const [result, setResult] = useState<RunReward | null>(null);
  const granted = useRef(false);
  // menu icons with the block outline baked in, keyed by kind; the raw
  // sprite shows until its processed version resolves
  const [icons, setIcons] = useState<Partial<Record<TowerKind, string>>>({});
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    if (!glRef.current || !uiRef.current) return;
    let alive = true;
    let game: Game | null = null;
    Game.create(glRef.current, uiRef.current, level, tech)
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
    // mode changes can also happen in-game (escape, right-click cancel);
    // the poll also catches the run ending, which settles the payout ONCE
    const poll = setInterval(() => {
      const g = gameRef.current;
      if (!g) return;
      const ui = g.ui();
      setHud(ui);
      if (ui.outcome !== "playing" && !granted.current) {
        granted.current = true;
        setResult(
          grantRunReward(
            level.id,
            Array.from(g.sim.killsByKind),
            ui.outcome === "won",
            ui.leaked === 0,
          ),
        );
      }
    }, 100);
    return () => {
      alive = false;
      clearInterval(poll);
      game?.destroy();
      gameRef.current = null;
    };
  }, [level, tech]);

  useEffect(() => {
    let alive = true;
    Promise.all(
      TOWER_KINDS.map(async (k) => [k, await turretIcon(TOWER_ICONS[k])] as const),
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

  const retry = (): void => {
    granted.current = false;
    setResult(null);
    gameRef.current?.reset();
  };

  if (webglError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0A101F]">
        <p className="p-8 text-center text-[#9AA7C7]">{webglError}</p>
      </div>
    );
  }

  const won = hud?.outcome === "won";

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
        <button
          onClick={onExit}
          className="absolute right-4 top-4 rounded border border-[#223050] bg-[#0D1424]/70 px-3 py-1.5 text-[11px] uppercase tracking-widest text-[#9AA7C7] backdrop-blur hover:border-[#35486E] hover:text-[#E8EDF7] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8]"
        >
          ◂ Retreat
        </button>
        {hud && (
          <div className="absolute left-4 top-4 max-w-[calc(100vw-2rem)] rounded border border-[#223050] bg-[#0D1424]/70 px-3 py-1.5 backdrop-blur">
            <div className="text-[11px] uppercase tracking-widest text-[#5B6885]">
              {level.id} · {level.name} — Wave {hud.currentWave} / {hud.totalWaves}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-[#E8EDF7]">
              <span
                className={
                  hud.coreHp <= hud.coreHpMax / 3 ? "text-[#FF5A5A]" : "text-[#E8EDF7]"
                }
              >
                Core {hud.coreHp}/{hud.coreHpMax}
              </span>
              <span className="flex items-center gap-1 text-[#E8B45B]">
                {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                <img
                  src={SCRAP_ICON}
                  alt="scrap"
                  className="h-4 w-4 shrink-0 [image-rendering:pixelated]"
                />
                {hud.scrapEarned}
              </span>
            </div>
            {hud.remaining > 0 && (
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
          {TOWER_KINDS.map((kind) => {
            const locked = hud?.unlocked ? !hud.unlocked.includes(kind) : false;
            const cap = hud?.caps ? hud.caps[kind] : null;
            const count = hud?.counts ? hud.counts[kind] : 0;
            const full = cap !== null && count >= cap;
            return (
              <button
                key={kind}
                title={
                  locked
                    ? `${TOWERS[kind].name} — locked (buy it in the tech tree)`
                    : TOWERS[kind].name
                }
                disabled={locked}
                aria-pressed={hud?.buildKind === kind}
                onClick={() => pickTower(kind)}
                className={`relative flex h-14 w-14 items-center justify-center rounded border backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8] ${
                  hud?.buildKind === kind
                    ? "border-[#5BD9E8] bg-[#16233E]/90"
                    : "border-[#223050] bg-[#0D1424]/70 hover:border-[#35486E]"
                } ${locked ? "cursor-not-allowed opacity-40 hover:border-[#223050]" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
                <img
                  src={icons[kind] ?? TOWER_ICONS[kind]}
                  alt={TOWERS[kind].name}
                  className={`h-10 w-10 [image-rendering:pixelated] ${locked ? "grayscale" : ""}`}
                />
                {locked ? (
                  <svg
                    viewBox="0 0 12 12"
                    className="absolute bottom-1 right-1 h-3.5 w-3.5 fill-[#9AA7C7]"
                    aria-hidden="true"
                  >
                    <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5H9a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5zm1.2 0h2.6V3.8a1.3 1.3 0 0 0-2.6 0V5z" />
                  </svg>
                ) : (
                  cap !== null && (
                    <span
                      className={`absolute bottom-0.5 right-1 text-[10px] font-semibold ${
                        full ? "text-[#E8B45B]" : "text-[#5B6885]"
                      }`}
                    >
                      {count}/{cap}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
        {hud && hud.outcome !== "playing" && result && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="w-[22rem] max-w-[calc(100vw-2rem)] rounded border border-[#223050] bg-[#0D1424]/95 p-5 backdrop-blur">
              <div
                className={`font-display text-xl uppercase tracking-widest ${
                  won ? "text-[#5BD9E8]" : "text-[#FF5A5A]"
                }`}
              >
                {won ? "Sector held" : "The core has fallen"}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-widest text-[#5B6885]">
                {level.id} · {level.name}
              </div>
              <div className="mt-4 space-y-1.5 text-sm">
                <Row label={`Kills (${hud.kills})`} value={result.killScrap} />
                {result.clearBonus > 0 && <Row label="Clear bonus" value={result.clearBonus} />}
                {result.perfectBonus > 0 && (
                  <Row label="Perfect defense" value={result.perfectBonus} />
                )}
                {result.incomeBonus > 0 && <Row label="Salvage teams" value={result.incomeBonus} />}
                <div className="border-t border-[#223050] pt-1.5">
                  <Row label="Scrap banked" value={result.total} strong />
                </div>
              </div>
              {result.firstClear && (
                <div className="mt-3 text-[11px] uppercase tracking-widest text-[#E8B45B]">
                  Next level unlocked
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  onClick={retry}
                  className="flex-1 rounded border border-[#223050] px-3 py-2 text-[11px] uppercase tracking-widest text-[#9AA7C7] hover:border-[#35486E] hover:text-[#E8EDF7] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8]"
                >
                  Retry
                </button>
                <button
                  onClick={onExit}
                  className="flex-1 rounded border border-[#5BD9E8] bg-[#16233E] px-3 py-2 text-[11px] uppercase tracking-widest text-[#5BD9E8] hover:bg-[#1B2B4A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8]"
                >
                  Command
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold text-[#E8EDF7]" : "text-[#9AA7C7]"}>{label}</span>
      <span className={`flex items-center gap-1 font-semibold ${strong ? "text-[#E8B45B]" : "text-[#E8EDF7]"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
        <img src={SCRAP_ICON} alt="scrap" className="h-3.5 w-3.5 [image-rendering:pixelated]" />
        {value}
      </span>
    </div>
  );
}
