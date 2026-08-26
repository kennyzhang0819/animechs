"use client";

import { WORLDS, type LevelSpec } from "@/game/levels";
import { isLevelUnlocked, type Progress } from "@/game/progress";
import { SCRAP_ICON } from "./towerIcons";

/** total enemies a level's script sends, for the card's threat line */
const enemyCount = (l: LevelSpec): number => {
  let n = 0;
  for (const step of l.script)
    if ("wave" in step) for (const c of Object.values(step.wave)) n += c ?? 0;
  return n;
};

export default function LevelSelect({
  progress,
  onPlay,
  onTech,
  onReset,
}: {
  progress: Progress;
  onPlay: (level: LevelSpec) => void;
  onTech: () => void;
  onReset: () => void;
}) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#070B14]">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="text-center">
          <h1 className="font-display text-3xl uppercase tracking-widest text-[#E8EDF7] sm:text-4xl">
            Sir, We Have a<br />
            <span className="text-[#5BD9E8]">Dagger Problem</span>
          </h1>
          <p className="mt-2 text-[11px] uppercase tracking-widest text-[#5B6885]">
            An incremental swarm defense — every run banks scrap, win or lose
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <span className="flex items-center gap-2 rounded border border-[#223050] bg-[#0D1424] px-4 py-2 font-semibold text-[#E8B45B]">
              {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
              <img
                src={SCRAP_ICON}
                alt="scrap"
                className="h-5 w-5 [image-rendering:pixelated]"
              />
              {progress.scrap}
            </span>
            <button
              onClick={onTech}
              className="rounded border border-[#5BD9E8] bg-[#16233E] px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-[#5BD9E8] hover:bg-[#1B2B4A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8]"
            >
              Tech tree
            </button>
          </div>
        </header>

        {WORLDS.map((world, wi) => {
          const worldLocked = !isLevelUnlocked(progress, world.levels[0].id);
          return (
            <section key={world.id} className="mt-10">
              <div className="flex items-baseline gap-3">
                <h2 className="font-display text-lg uppercase tracking-widest text-[#E8EDF7]">
                  World {world.id} — {world.name}
                </h2>
                {worldLocked && (
                  <span className="text-[11px] uppercase tracking-widest text-[#5B6885]">
                    Clear world {WORLDS[wi - 1]?.id ?? world.id - 1} to enter
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {world.levels.map((level) => {
                  const cleared = progress.completed.includes(level.id);
                  const unlocked = isLevelUnlocked(progress, level.id);
                  return (
                    <button
                      key={level.id}
                      disabled={!unlocked}
                      onClick={() => onPlay(level)}
                      className={`rounded border p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#5BD9E8] ${
                        unlocked
                          ? "border-[#223050] bg-[#0D1424] hover:border-[#5BD9E8]"
                          : "cursor-not-allowed border-[#16203A] bg-[#0A101F] opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-display text-base uppercase tracking-widest text-[#5BD9E8]">
                          {level.id}
                        </span>
                        {cleared ? (
                          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#7BD88F]">
                            Cleared
                          </span>
                        ) : !unlocked ? (
                          <svg
                            viewBox="0 0 12 12"
                            className="h-4 w-4 fill-[#5B6885]"
                            aria-hidden="true"
                          >
                            <path d="M3.5 5V3.8a2.5 2.5 0 0 1 5 0V5H9a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h.5zm1.2 0h2.6V3.8a1.3 1.3 0 0 0-2.6 0V5z" />
                          </svg>
                        ) : null}
                      </div>
                      <div className="mt-1 font-semibold text-[#E8EDF7]">{level.name}</div>
                      <div className="mt-1 text-[11px] uppercase tracking-widest text-[#5B6885]">
                        {enemyCount(level)} enemies
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#9AA7C7]">
                        Clear bonus
                        {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                        <img
                          src={SCRAP_ICON}
                          alt="scrap"
                          className="h-3 w-3 [image-rendering:pixelated]"
                        />
                        <span className="font-semibold text-[#E8B45B]">{level.clearBonus}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        <footer className="mt-12 text-center">
          <button
            onClick={() => {
              if (window.confirm("Wipe all progress — scrap, tech, and cleared levels?"))
                onReset();
            }}
            className="text-[11px] uppercase tracking-widest text-[#5B6885] underline-offset-2 hover:text-[#FF5A5A] hover:underline"
          >
            Reset save
          </button>
        </footer>
      </div>
    </div>
  );
}
