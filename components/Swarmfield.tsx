"use client";

import { useEffect, useRef, useState } from "react";
import { Game, type UiState } from "@/game/game";
import {
  UNIT_KINDS,
  WORLDS,
  waveGroups,
  type LevelSpec,
  type TowerKind,
  type UnitKind,
} from "@/game/levels";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import {
  grantRunReward,
  isLevelUnlocked,
  loadProgress,
  resetProgress,
  techOf,
  type Progress,
  type RunReward,
} from "@/game/progress";
import { turretIcon } from "@/game/atlas";
import TechTree from "./TechTree";
import { SCRAP_ICON } from "./towerIcons";

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
    for (const g of waveGroups(step.wave)) for (const c of g.counts) n += c;
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

/** a scrap amount with the item sprite, for reward rows and headers */
function Scrap({ value, dim }: { value: number; dim?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold ${
        dim ? "text-[#A6A6AF]" : "text-[#FFD37F]"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
      <img src={SCRAP_ICON} alt="scrap" className="h-4 w-4 [image-rendering:pixelated]" />
      {value}
    </span>
  );
}

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
  const [screen, setScreen] = useState<"menu" | "tech" | "game">("menu");
  const [level, setLevel] = useState<LevelSpec | null>(null);
  // the selector draws map previews, so the documents load with the menu —
  // Game.create re-fetches later, keeping in-game state just as fresh
  const [mapsReady, setMapsReady] = useState(false);
  // the campaign save (scrap, cleared levels, tech nodes) — localStorage,
  // so it loads in an effect; null only for the first client frame
  const [progress, setProgress] = useState<Progress | null>(null);
  // a finished run's settled payout: non-null exactly while the results
  // overlay shows the breakdown, and the guard against granting twice
  const [result, setResult] = useState<RunReward | null>(null);
  const granted = useRef(false);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

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
    if (screen !== "game" || !level || !glRef.current || !uiRef.current) return;
    let alive = true;
    let game: Game | null = null;
    Game.create(glRef.current, uiRef.current)
      .then((g) => {
        if (!alive) {
          g.destroy();
          return;
        }
        g.setTech(techOf(loadProgress()));
        g.loadLevel(level);
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
      if ((ui.lost || ui.won) && !granted.current) {
        granted.current = true;
        setResult(grantRunReward(level.id, Array.from(g.sim.killsByKind), ui.won));
        setProgress(loadProgress());
      }
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
  }, [screen, level]);

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

  const backToMenu = (): void => {
    granted.current = false;
    setResult(null);
    setProgress(loadProgress());
    setScreen("menu");
  };

  const retry = (): void => {
    const g = gameRef.current;
    if (!g) return;
    granted.current = false;
    setResult(null);
    // the run just banked scrap — a node bought mid-overlay would not apply
    // without this re-read (tech is per-run anyway, but keep it honest)
    g.setTech(techOf(loadProgress()));
    g.reset();
    setHud(g.ui());
  };

  if (webglError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#101013]">
        <p className="p-8 text-center text-[#A6A6AF]">{webglError}</p>
      </div>
    );
  }

  if (screen === "tech" && progress) {
    return (
      <TechTree
        progress={progress}
        onChanged={() => setProgress(loadProgress())}
        onBack={() => setScreen("menu")}
      />
    );
  }

  if (screen !== "game" || !level) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-[#101013]">
        <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-8 px-6 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold uppercase tracking-[0.35em] text-[#EDEDEF]">
              Sir, We Have a<br />
              <span className="text-[#FFD37F]">Dagger Problem</span>
            </h1>
            <p className="mt-3 text-[11px] uppercase tracking-widest text-[#71717C]">
              Every run banks scrap, win or lose — spend it in the tech tree
            </p>
          </div>
          {progress && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 rounded border border-[#2E2E36] bg-[#151518] px-4 py-2">
                <Scrap value={progress.scrap} />
              </span>
              <button
                onClick={() => setScreen("tech")}
                className="rounded border border-[#FFD37F] bg-[#222227]/90 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
              >
                Tech tree
              </button>
            </div>
          )}
          {progress &&
            WORLDS.map((world) => {
              const worldLocked = !isLevelUnlocked(progress, world.levels[0].id);
              return (
                <section key={world.id} className="w-full">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
                      World {world.id} — {world.name}
                    </h2>
                    {worldLocked && (
                      <span className="text-[11px] uppercase tracking-widest text-[#71717C]">
                        Clear world {world.id - 1} to enter
                      </span>
                    )}
                  </div>
                  <div
                    role="group"
                    aria-label={`world ${world.id} levels`}
                    className="mt-3 flex flex-wrap gap-4"
                  >
                    {world.levels.map((lv) => {
                      const { waves, enemies } = levelSummary(lv);
                      const unlocked = isLevelUnlocked(progress, lv.id);
                      const cleared = progress.completed.includes(lv.id);
                      return (
                        <button
                          key={lv.id}
                          disabled={!unlocked}
                          onClick={() => {
                            setLevel(lv);
                            setScreen("game");
                          }}
                          className={`w-72 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                            unlocked
                              ? "border-[#2E2E36] bg-[#151518]/70 hover:border-[#FFD37F] hover:bg-[#222227]/90"
                              : "cursor-not-allowed border-[#222227] bg-[#121215]/60 opacity-50"
                          }`}
                        >
                          {mapsReady && <LevelThumb mapId={lv.map ?? OFFICIAL_MAP_IDS[0]} />}
                          <div className="mt-2 flex items-baseline justify-between">
                            <span className="text-base font-semibold text-[#EDEDEF]">
                              {lv.id} · {lv.name}
                            </span>
                            {cleared ? (
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7BE58A]">
                                Cleared
                              </span>
                            ) : !unlocked ? (
                              <svg
                                viewBox="0 0 12 12"
                                className="h-4 w-4 fill-[#71717C]"
                                aria-hidden="true"
                              >
                                <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5H9a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5zm1.2 0h2.6V3.8a1.3 1.3 0 0 0-2.6 0V5z" />
                              </svg>
                            ) : null}
                          </div>
                          <div className="mt-1 flex items-baseline justify-between text-[11px] uppercase tracking-widest text-[#71717C]">
                            <span>
                              {waves} waves · {enemies} enemies
                            </span>
                            <Scrap value={lv.clearBonus} dim />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          <div className="flex flex-col items-center gap-6">
            <button
              onClick={() => {
                if (window.confirm("Wipe all progress — scrap, tech, and cleared levels?")) {
                  resetProgress();
                  setProgress(loadProgress());
                }
              }}
              className="text-[11px] uppercase tracking-widest text-[#71717C] underline-offset-2 hover:text-[#FF5A5A] hover:underline"
            >
              Reset save
            </button>
            <p className="text-center text-[11px] uppercase tracking-widest text-[#71717C]">
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
        </div>
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
              {level.id} · {level.name} — Wave {hud.currentWave} / {hud.totalWaves}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <Scrap value={hud.scrapEarned} />
              {hud.remaining > 0 && (
                // icon + count only; wraps rather than running off the
                // viewport once a level fields more kinds than fit on a line
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold text-[#EDEDEF]">
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
                </span>
              )}
            </div>
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
          {TOWER_MENU.map((t) => {
            const locked = hud?.unlocked ? !hud.unlocked.includes(t.kind) : false;
            const cap = hud?.caps ? hud.caps[t.kind] : null;
            const count = hud?.counts ? hud.counts[t.kind] : 0;
            const full = cap !== null && count >= cap;
            return (
              <button
                key={t.kind}
                title={locked ? `${t.name} — locked (buy it in the tech tree)` : t.name}
                disabled={locked}
                aria-pressed={hud?.buildKind === t.kind}
                onClick={() => pickTower(t.kind)}
                className={`relative flex h-14 w-14 items-center justify-center rounded border backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                  hud?.buildKind === t.kind
                    ? "border-[#FFD37F] bg-[#222227]/90"
                    : "border-[#2E2E36] bg-[#151518]/70 hover:border-[#4A4A55]"
                } ${locked ? "cursor-not-allowed opacity-40 hover:border-[#2E2E36]" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
                <img
                  src={icons[t.kind] ?? t.icon}
                  alt={t.name}
                  className={`h-10 w-10 [image-rendering:pixelated] ${locked ? "grayscale" : ""}`}
                />
                {locked ? (
                  <svg
                    viewBox="0 0 12 12"
                    className="absolute bottom-1 right-1 h-3.5 w-3.5 fill-[#A6A6AF]"
                    aria-hidden="true"
                  >
                    <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5H9a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5zm1.2 0h2.6V3.8a1.3 1.3 0 0 0-2.6 0V5z" />
                  </svg>
                ) : (
                  cap !== null && (
                    <span
                      className={`absolute bottom-0.5 right-1 text-[10px] font-semibold ${
                        full ? "text-[#FFD37F]" : "text-[#71717C]"
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
                {result && (
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    <span>Scrap salvaged</span>
                    <Scrap value={result.total} />
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={retry}
                  className="rounded border border-[#FFD37F] bg-[#222227]/90 px-5 py-2 text-sm font-semibold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Retry
                </button>
                <button
                  onClick={backToMenu}
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
              <div className="mt-4 space-y-1.5 text-sm text-[#A6A6AF]">
                <div>
                  Kills <span className="font-semibold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {result && (
                  <>
                    <div className="flex items-center justify-between">
                      <span>Kill salvage</span>
                      <Scrap value={result.killScrap} dim />
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Clear bonus</span>
                      <Scrap value={result.clearBonus} dim />
                    </div>
                    <div className="flex items-center justify-between border-t border-[#2E2E36] pt-1.5">
                      <span className="font-semibold text-[#EDEDEF]">Scrap banked</span>
                      <Scrap value={result.total} />
                    </div>
                    {result.firstClear && (
                      <div className="pt-1 text-[10px] uppercase tracking-widest text-[#FFD37F]">
                        Next level unlocked
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="mt-6 flex justify-center">
                <button
                  onClick={backToMenu}
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
                  onClick={backToMenu}
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
