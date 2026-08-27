"use client";

import { useEffect, useRef, useState } from "react";
import {
  firstLoadStep,
  Game,
  LOAD_STEP_LABEL,
  LOAD_STEPS,
  SPEEDS,
  type LoadStep,
  type UiState,
} from "@/game/game";
import {
  loadLevelDocs,
  UNIT_KINDS,
  WORLD,
  waveGroups,
  type LevelSpec,
  type TowerKind,
  type UnitKind,
} from "@/game/levels";
import {
  audit,
  budget,
  check,
  difficultyName,
  specForTier,
  waveCost,
  waveGuide,
  tierDropBonus,
  tierLevel,
  HP_PER_LEVEL,
  TOP_TIER,
} from "@/game/ladder";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import {
  grantRunReward,
  isTierCleared,
  loadProgress,
  resetProgress,
  techOf,
  topTier,
  type Progress,
  type RunReward,
} from "@/game/progress";
import { turretIcon } from "@/game/atlas";
import { isEmpty } from "@/game/items";
import { CostRow, Wallet } from "./Items";
import TechTree from "./TechTree";

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

/** the level card's map preview — the admin editor's thumbnail look */
function LevelThumb({ mapId }: { mapId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const m = loadMap(mapId);
    if (m && ref.current) drawThumb(m, ref.current);
  }, [mapId]);
  // fixed-aspect frame: maps differ in proportion (a taller world 2 next to
  // a wide world 1), and letting each canvas set its own height left the
  // cards ragged. The preview sits centred inside a constant box instead
  return (
    <div className="flex aspect-[16/9] items-center justify-center overflow-hidden rounded border border-[#2E2E36] bg-[#101013]">
      <canvas ref={ref} className="h-full w-full object-contain [image-rendering:pixelated]" />
    </div>
  );
}

/**
 * How long the loading screen stays up at minimum, and how long it takes to
 * fade. A warm start finishes in a few milliseconds, and an overlay that
 * appears and vanishes inside one frame reads as a glitch rather than as a
 * transition — so the screen is held briefly and dissolved, which costs a
 * third of a second and buys a level start that looks deliberate.
 */
const MIN_LOAD_MS = 420;
const FADE_MS = 260;

/** the loading screen's own state: which step, and whether it is dissolving */
interface LoadUi {
  step: LoadStep;
  out: boolean;
}

/** the screen shown while a level is being prepared */
function LoadingScreen({
  level,
  step,
  out,
}: {
  level: LevelSpec;
  step: LoadStep;
  out: boolean;
}) {
  const { waves, enemies } = levelSummary(level);
  // steps, not bytes: nothing here streams, so the bar fills a stage at a
  // time rather than pretending to a percentage it cannot know
  const done = LOAD_STEPS.indexOf(step) + 1;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading ${level.name}`}
      className={`absolute inset-0 z-20 flex items-center justify-center bg-[#101013] transition-opacity duration-[260ms] ${
        out ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-8">
        <div className="w-full">
          <LevelThumb mapId={level.map ?? OFFICIAL_MAP_IDS[0]} />
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <h2 className="text-3xl font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
            {level.name}
          </h2>
          <p className="text-[13px] uppercase tracking-widest text-[#71717C]">
            {difficultyName(level.tier ?? 0)} — {waves} waves — {enemies} enemies
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-[#2E2E36]">
            <div
              className="h-full rounded-full bg-[#FFD37F] transition-[width] duration-200 ease-out"
              style={{ width: `${(done / LOAD_STEPS.length) * 100}%` }}
            />
          </div>
          <p className="text-center text-[13px] uppercase tracking-widest text-[#71717C]">
            {LOAD_STEP_LABEL[step]}
          </p>
        </div>
      </div>
    </div>
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

/**
 * The campaign menu: one world, and the TIER of the ladder to play it at.
 *
 * The frontier — the highest tier not yet cleared — is the default and the
 * headline, because it is both the hardest run available and the best-paying
 * one (a first clear pays double). Stepping down is farming: every tier
 * below the frontier still pays its drop bonus, which is what a player does
 * while they close the gap to the next one.
 */
function TierPicker({
  progress,
  tier,
  onTier,
  mapsReady,
  onStart,
}: {
  progress: Progress;
  tier: number;
  onTier: (t: number) => void;
  mapsReady: boolean;
  onStart: () => void;
}) {
  const top = topTier(progress);
  const spec = specForTier(WORLD, tier);
  const { waves, enemies } = levelSummary(spec);
  const level = tierLevel(tier);
  // the enemy level in the one unit that means anything to a player: how
  // many times over a body has to be shot compared with the opening tier
  const health = HP_PER_LEVEL ** level;
  const step = (d: number): void => onTier(Math.min(top, Math.max(0, tier + d)));

  return (
    <div className="w-[22rem] rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-4">
      {mapsReady && <LevelThumb mapId={spec.map ?? OFFICIAL_MAP_IDS[0]} />}
      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-lg font-bold text-[#EDEDEF]">{spec.name}</span>
        {isTierCleared(progress, tier) ? (
          <span className="text-[12px] font-bold uppercase tracking-widest text-[#7BE58A]">
            Cleared
          </span>
        ) : (
          <span className="text-[12px] font-bold uppercase tracking-widest text-[#FFD37F]">
            New
          </span>
        )}
      </div>

      <div
        role="group"
        aria-label="difficulty select"
        className="mt-3 flex items-center justify-between gap-2"
      >
        <button
          aria-label="lower difficulty"
          disabled={tier <= 0}
          onClick={() => step(-1)}
          className="h-9 w-9 rounded border border-[#2E2E36] text-lg font-bold text-[#A6A6AF] enabled:hover:border-[#FFD37F] enabled:hover:text-[#EDEDEF] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
        >
          −
        </button>
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#71717C]">Difficulty</div>
          <div className="text-2xl font-bold uppercase leading-none tracking-[0.15em] text-[#FFD37F]">
            {difficultyName(tier)}
          </div>
        </div>
        <button
          aria-label="higher difficulty"
          disabled={tier >= top}
          onClick={() => step(1)}
          className="h-9 w-9 rounded border border-[#2E2E36] text-lg font-bold text-[#A6A6AF] enabled:hover:border-[#FFD37F] enabled:hover:text-[#EDEDEF] disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
        >
          +
        </button>
      </div>

      {/* what this tier actually costs and pays, in the four numbers that
          decide whether to push or farm */}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-[#2E2E36] pt-3 text-[13px]">
        <dt className="text-[#71717C]">Waves</dt>
        <dd className="text-right font-bold text-[#EDEDEF]">{waves}</dd>
        <dt className="text-[#71717C]">Enemies</dt>
        <dd className="text-right font-bold text-[#EDEDEF]">{enemies.toLocaleString()}</dd>
        <dt className="text-[#71717C]">Enemy level</dt>
        <dd className="text-right font-bold text-[#EDEDEF]">
          {level} <span className="text-[#71717C]">(×{health.toFixed(1)} hp)</span>
        </dd>
        <dt className="text-[#71717C]">Salvage</dt>
        <dd className="text-right font-bold text-[#7BE58A]">
          ×{tierDropBonus(tier).toFixed(2)}
        </dd>
      </dl>

      <button
        onClick={onStart}
        className="mt-3 w-full rounded border border-[#FFD37F] bg-[#222227]/90 py-2 text-[13px] font-bold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
      >
        Deploy
      </button>
    </div>
  );
}

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
    kind: "scorch",
    name: "Scorch",
    icon: "/mindustry/sprites/blocks/turrets/scorch.png",
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

/** the two wave buttons in the HUD, sized to be hit without aiming */
const WAVE_BTN =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#2E2E36] text-[#FFD37F] hover:border-[#FFD37F] hover:bg-[#222227]/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]";

/**
 * The "skip to wave" box, opened by the double-play button in the HUD and
 * folded away by default — it is a tool for reaching a late wave, not part
 * of playing the level.
 *
 * Nothing is actually skipped: the sim spawns every wave up to the target
 * back to back with no gap (see Sim.skipToWave), so what lands on the field
 * is all of them at once. The box says so, because "skip" reads like the
 * waves in between never arrive.
 */
function SkipToWave({
  onClose,
  hud,
  onSkip,
}: {
  onClose: () => void;
  hud: UiState;
  onSkip: (n: number) => void;
}) {
  const [text, setText] = useState("");
  const target = Math.floor(Number(text));
  // only forward: the script has no reverse, and the wave already on the
  // field is already here. There is no upper bound — past the last wave just
  // empties the script onto the field
  const valid = text.trim() !== "" && Number.isFinite(target) && target > hud.currentWave;
  const send = (): void => {
    if (!valid) return;
    onSkip(target);
    setText("");
  };

  return (
    <div className="w-full rounded border border-[#2E2E36] bg-[#151518]/70 px-3 py-1.5 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="skip-to-wave"
          className="text-[13px] font-bold uppercase tracking-widest text-[#71717C]"
        >
          Skip to wave
        </label>
        <input
          id="skip-to-wave"
          type="number"
          min={hud.currentWave + 1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
            // the canvas listens on window for hotkeys — a wave number is
            // not a build shortcut
            e.stopPropagation();
          }}
          placeholder={`${hud.currentWave + 1}`}
          className="w-16 shrink-0 rounded border border-[#2E2E36] bg-[#0E0E11] px-1.5 py-0.5 text-base font-bold text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
        />
        <button
          onClick={send}
          disabled={!valid}
          className="rounded border border-[#2E2E36] px-2 py-0.5 text-[13px] font-bold uppercase tracking-widest text-[#FFD37F] hover:border-[#FFD37F] hover:bg-[#222227]/90 disabled:cursor-not-allowed disabled:border-[#2E2E36] disabled:text-[#4A4A55] disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
        >
          Go
        </button>
        <button
          onClick={onClose}
          title="Hide"
          aria-label="Hide skip to wave"
          className="text-[13px] font-bold uppercase tracking-widest text-[#71717C] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
        >
          x
        </button>
      </div>
      <p className="mt-0.5 text-[13px] uppercase tracking-widest text-[#71717C] break-words">
        {hud.rushTo > 0 ? (
          <>
            <span className="font-bold text-[#FFD37F]">Spawning to wave {hud.rushTo}</span>{" "}
            <button
              onClick={() => onSkip(0)}
              className="uppercase tracking-widest text-[#71717C] underline underline-offset-2 hover:text-[#FF5A5A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
            >
              Stop
            </button>
          </>
        ) : (
          `Spawns every wave up to it — none are skipped`
        )}
      </p>
    </div>
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
  /**
   * The tier the menu is pointed at. It follows the frontier whenever the
   * save advances — pushing is the default action and the frontier is the
   * only tier that still pays its first-clear bonus — but the player can
   * step it back down to farm a tier they already own.
   */
  const [tier, setTier] = useState(0);
  // the selector draws map previews, so the documents load with the menu —
  // Game.create re-fetches later, keeping in-game state just as fresh
  const [mapsReady, setMapsReady] = useState(false);
  // sandbox mode, hidden until Ctrl+Shift+S like the admin page's
  // Ctrl+Shift+M: reveals the fast-forward strip AND lifts the tech tree's
  // turret locks and placement caps (Game.setTech(null)), so a run can be
  // staged for filming. Leaving it drops back to whatever the save allows —
  // but the current speed keeps running, so the control can be hidden
  // mid-run without snapping the game back to 1x
  const [admin, setAdmin] = useState(false);
  // the campaign save (bank, cleared levels, tech nodes) — localStorage,
  // so it loads in an effect; null only for the first client frame
  const [progress, setProgress] = useState<Progress | null>(null);
  // a finished run's settled payout: non-null exactly while the results
  // overlay shows the breakdown, and the guard against granting twice
  const [result, setResult] = useState<RunReward | null>(null);
  // non-null exactly while the loading screen is up, including its fade
  const [loadUi, setLoadUi] = useState<LoadUi | null>(null);
  // the "skip to wave" box under the HUD starts folded away: it is a tool
  // for testing a late wave, not part of playing the level
  const [skipOpen, setSkipOpen] = useState(false);
  const granted = useRef(false);

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setTier(topTier(p));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // ctrl OR cmd, same as AdminShortcut — Ctrl+Shift+S is the pair that
      // arrives on every platform (Cmd+Shift+S is the browser's save dialog)
      if ((!e.ctrlKey && !e.metaKey) || !e.shiftKey || e.code !== "KeyS") return;
      e.preventDefault();
      setAdmin((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // a run already in progress picks the mode up immediately
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    g.setTech(admin ? null : techOf(loadProgress()));
    setHud(g.ui());
  }, [admin]);

  useEffect(() => {
    let alive = true;
    // level documents overlay WORLDS in place (see levels.ts), so a script
    // edited in the admin level editor is what the menu counts and the run
    // plays. A level with no document keeps the campaign as shipped
    Promise.all([loadOfficialMaps(), loadLevelDocs()])
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
    const timers: ReturnType<typeof setTimeout>[] = [];
    // the overlay covers the canvases from the first render of the game
    // screen, so the black canvas is never seen at all
    const startedAt = performance.now();
    setLoadUi({ step: firstLoadStep(), out: false });
    Game.create(glRef.current, uiRef.current, level, (step) => {
      // a step arriving after teardown must not resurrect the overlay
      if (alive) setLoadUi((ui) => (ui ? { ...ui, step } : ui));
    })
      .then((g) => {
        if (!alive) {
          g.destroy();
          return;
        }
        g.setTech(admin ? null : techOf(loadProgress()));
        game = g;
        gameRef.current = g;
        setHud(g.ui());
        if (process.env.NODE_ENV !== "production") {
          const w = window as unknown as Record<string, unknown>;
          w.__swarmfield = g;
          // the ladder's number guide, next to the running game.
          // `__ladder.audit()` is one row a difficulty, `.waves()` one row a
          // wave, and `.spec(n)` is what to hand `sim.loadLevel` to watch a
          // difficulty actually play out
          w.__ladder = {
            spec: (n: number) => specForTier(WORLD, n),
            budget: (n: number) => budget(WORLD, n),
            // the number guide: audit() is one row a difficulty, waves() is
            // one row a wave with its share of the difficulty it belongs to
            audit: () => audit(WORLD),
            waves: () => waveGuide(WORLD),
            check: () => check(WORLD),
            wave: (i: number, tier = 0) => waveCost(WORLD.script[i], tierLevel(tier)),
          };
        }
        // hold the screen out to its minimum, then dissolve it. The game is
        // already running underneath — the sim ticks through the fade, so
        // the first wave's timer starts when the player can see the field
        timers.push(
          setTimeout(() => {
            setLoadUi((ui) => (ui ? { ...ui, out: true } : ui));
            timers.push(setTimeout(() => setLoadUi(null), FADE_MS));
          }, Math.max(0, MIN_LOAD_MS - (performance.now() - startedAt))),
        );
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // the error screen replaces everything, so the overlay must go or it
        // would sit on top of the message
        setLoadUi(null);
        setWebglError(err instanceof Error ? err.message : String(err));
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
        const reward = grantRunReward(level.tier ?? 0, Array.from(g.sim.killsByKind), ui.won);
        const after = loadProgress();
        setResult(reward);
        setProgress(after);
        // the picker follows the frontier ONLY when the frontier moved. A
        // player farming tier 2 with a frontier of 7 has chosen that tier
        // and must not be yanked back up to 7 for clearing it again
        if (reward.firstClear) setTier(topTier(after));
      }
    }, 100);
    return () => {
      alive = false;
      clearInterval(poll);
      for (const t of timers) clearTimeout(t);
      game?.destroy();
      gameRef.current = null;
      setHud(null);
      setLoadUi(null);
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
    // the run just banked its drops — a node bought mid-overlay would not apply
    // without this re-read (tech is per-run anyway, but keep it honest)
    g.setTech(admin ? null : techOf(loadProgress()));
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
        <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-8 px-6 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold uppercase tracking-[0.35em] text-[#EDEDEF]">
              Sir, We Have a<br />
              <span className="text-[#FFD37F]">Dagger Problem</span>
            </h1>
          </div>
          {progress && (
            <div className="flex items-center gap-3">
              <span className="flex items-center rounded border border-[#2E2E36] bg-[#151518] px-4 py-2">
                <Wallet bank={progress.bank} />
              </span>
              <button
                onClick={() => setScreen("tech")}
                className="rounded border border-[#FFD37F] bg-[#222227]/90 px-4 py-2 text-[13px] font-bold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
              >
                Upgrades
              </button>
            </div>
          )}
          {progress && (
            <TierPicker
              progress={progress}
              tier={tier}
              onTier={setTier}
              mapsReady={mapsReady}
              onStart={() => {
                setLevel(specForTier(WORLD, tier));
                setScreen("game");
                // raised in the same batch as the screen switch, so the game
                // screen's FIRST paint is already covered — an effect would
                // run after that paint and let a frame of black canvas through
                setLoadUi({ step: firstLoadStep(), out: false });
              }}
            />
          )}
          <div className="flex flex-col items-center gap-6">
            <button
              onClick={() => {
                if (window.confirm("Wipe all progress — resources, tech, and cleared tiers?")) {
                  resetProgress();
                  const p = loadProgress();
                  setProgress(p);
                  setTier(topTier(p));
                }
              }}
              className="text-[13px] uppercase tracking-widest text-[#71717C] underline-offset-2 hover:text-[#FF5A5A] hover:underline"
            >
              Reset save
            </button>
            <p className="text-center text-[13px] uppercase tracking-widest text-[#71717C]">
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
        {loadUi && (
          <LoadingScreen level={level} step={loadUi.step} out={loadUi.out} />
        )}
        {hud?.paused && (
          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded border border-[#E8B45B] bg-[#151518]/70 px-3 py-1.5 text-base font-bold uppercase tracking-widest text-[#E8B45B] backdrop-blur">
            Paused
          </div>
        )}
        {/* one fixed width for the whole top-left stack, so the panel does
            not breathe in and out as counters change and the skip box lines
            up under it. Everything inside wraps rather than widening it */}
        {hud && (
          <div className="absolute left-4 top-4 flex w-80 max-w-[calc(100vw-2rem)] flex-col items-stretch gap-2">
            <div className="w-full rounded border border-[#2E2E36] bg-[#151518]/70 px-3 py-1.5 backdrop-blur">
              {/* the wave counter is what a run is read off, so the line
                  carries that and the difficulty and nothing else — the level
                  name is on the card that launched it */}
              <div className="text-[13px] uppercase tracking-widest text-[#71717C] break-words">
                {difficultyName(hud.tier)} — Wave{" "}
                <span className="font-bold text-[#EDEDEF]">{hud.currentWave}</span> / {hud.totalWaves}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                {/* what the run has banked so far, one stack per currency —
                    empty until the first kill, so it doesn't sit at "0" */}
                <CostRow cost={hud.earned} />
                {hud.remaining > 0 && (
                  // icon + count only; wraps rather than running off the
                  // viewport once a level fields more kinds than fit on a line
                  <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-bold text-[#EDEDEF]">
                    {UNIT_KINDS.map(
                      (k, i) =>
                        hud.byKind[i] > 0 && (
                          <span key={k} className="flex items-center gap-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                            <img
                              src={unitIcon(k)}
                              alt={k}
                              className="h-5 w-5 shrink-0 object-contain [image-rendering:pixelated]"
                            />
                            {hud.byKind[i]}
                          </span>
                        ),
                    )}
                  </span>
                )}
              </div>
              {/* the two wave controls sit together: single play releases the
                  next wave, double play opens the box that runs to a wave
                  further out. Only the countdown is conditional — a rush has
                  no timer to wait for, so its button is always here */}
              <div className="flex flex-wrap items-center gap-2 text-[13px] uppercase tracking-widest text-[#71717C]">
                {hud.nextWaveIn > 0 && (
                  <>
                    <span>
                      Next wave{" "}
                      <span className="font-bold text-[#EDEDEF]">
                        {Math.ceil(hud.nextWaveIn)}
                      </span>
                    </span>
                    <button
                      title="Start next wave now"
                      aria-label="Start next wave now"
                      onClick={() => gameRef.current?.skipWave()}
                      className={WAVE_BTN}
                    >
                      <svg viewBox="0 0 12 12" className="h-4 w-4 fill-current" aria-hidden="true">
                        <path d="M2.5 1.5v9l8-4.5z" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  title="Skip to wave"
                  aria-label="Skip to wave"
                  aria-expanded={skipOpen}
                  onClick={() => setSkipOpen(!skipOpen)}
                  className={`${WAVE_BTN} ${
                    skipOpen || hud.rushTo > 0 ? "border-[#FFD37F] bg-[#222227]/90" : ""
                  }`}
                >
                  <svg viewBox="0 0 12 12" className="h-4 w-4 fill-current" aria-hidden="true">
                    <path d="M1 1.5v9l5-4.5zM6 1.5v9l5-4.5z" />
                  </svg>
                </button>
              </div>
            </div>
            {skipOpen && (
            <SkipToWave
              onClose={() => setSkipOpen(false)}
              hud={hud}
              onSkip={(n) => {
                const g = gameRef.current;
                if (!g) return;
                g.skipToWave(n);
                setHud(g.ui());
              }}
            />
            )}
          </div>
        )}
        {hud && admin && (
          <div
            role="group"
            aria-label="sandbox controls"
            className="absolute bottom-4 left-4 flex overflow-hidden rounded border border-[#2E2E36] bg-[#151518]/70 backdrop-blur"
          >
            <span className="border-r border-[#2E2E36] px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest text-[#FFD37F]">
              Sandbox
            </span>
            {SPEEDS.map((mult) => (
              <button
                key={mult}
                title={`${mult}x speed`}
                aria-pressed={hud.speed === mult}
                onClick={() => {
                  const g = gameRef.current;
                  if (!g) return;
                  g.setSpeed(mult);
                  setHud(g.ui());
                }}
                className={`px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                  hud.speed === mult
                    ? "bg-[#222227] text-[#FFD37F]"
                    : "text-[#71717C] hover:bg-[#222227]/60 hover:text-[#A6A6AF]"
                }`}
              >
                {mult}x
              </button>
            ))}
          </div>
        )}
        <div
          role="group"
          aria-label="tower menu"
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2"
        >
          {/* a turret the tech tree has not unlocked yet is not shown at
              all — the bar holds exactly what this run can build. A null
              unlocked list is sandbox mode: everything, uncapped */}
          {TOWER_MENU.filter((t) => (hud ? !hud.unlocked || hud.unlocked.includes(t.kind) : false)).map((t) => {
            const cap = hud?.caps ? hud.caps[t.kind] : null;
            const count = hud?.counts ? hud.counts[t.kind] : 0;
            // what the badge says is how many are LEFT to place, not how
            // many are standing — that is the number a build decision needs,
            // and "0" reads faster than working out 6/6
            const left = cap === null ? null : Math.max(0, cap - count);
            const full = left === 0;
            return (
              <button
                key={t.kind}
                title={t.name}
                aria-label={left === null ? t.name : `${t.name}, ${left} left`}
                aria-pressed={hud?.buildKind === t.kind}
                onClick={() => pickTower(t.kind)}
                className={`flex h-[4.5rem] w-14 flex-col items-center justify-center gap-0.5 rounded border backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                  hud?.buildKind === t.kind
                    ? "border-[#FFD37F] bg-[#222227]/90"
                    : "border-[#2E2E36] bg-[#151518]/70 hover:border-[#4A4A55]"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
                <img
                  src={icons[t.kind] ?? t.icon}
                  alt=""
                  className="h-10 w-10 [image-rendering:pixelated]"
                />
                {left !== null && (
                  <span
                    className={`text-base font-bold leading-none ${
                      full ? "text-[#FFD37F]" : "text-white"
                    }`}
                  >
                    {left}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {hud?.lost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-80 rounded border border-[#3A2430] bg-[#151518]/95 p-6 text-center">
              <div className="text-xl font-bold uppercase tracking-widest text-[#FF5A5A]">
                Core destroyed
              </div>
              <div className="mt-4 space-y-1 text-base text-[#A6A6AF]">
                <div>
                  Reached wave{" "}
                  <span className="font-bold text-[#EDEDEF]">{hud.currentWave}</span> of{" "}
                  {hud.totalWaves}
                </div>
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {result && !isEmpty(result.earned) && (
                  <div className="space-y-1 pt-1">
                    {/* kills are the only income, so a loss still pays for
                        everything the towers killed on the way down —
                        which is what makes a failed push into progress */}
                    <div>Salvaged (×{result.dropBonus.toFixed(2)})</div>
                    <CostRow cost={result.earned} className="justify-center" />
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={retry}
                  className="rounded border border-[#FFD37F] bg-[#222227]/90 px-5 py-2 text-base font-bold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Retry
                </button>
                <button
                  onClick={backToMenu}
                  className="rounded border border-[#2E2E36] px-5 py-2 text-base font-bold uppercase tracking-widest text-[#A6A6AF] hover:border-[#4A4A55] hover:bg-[#222227]/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
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
              <div className="text-xl font-bold uppercase tracking-widest text-[#7BE58A]">
                {difficultyName(hud.tier)} cleared
              </div>
              <div className="mt-4 space-y-1.5 text-base text-[#A6A6AF]">
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {result && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#2E2E36] pt-1.5">
                      <span className="font-bold text-[#EDEDEF]">
                        Salvaged
                        <span className="ml-1 font-normal text-[#71717C]">
                          ×{result.dropBonus.toFixed(2)}
                        </span>
                      </span>
                      {isEmpty(result.earned) ? (
                        <span className="text-[#71717C]">nothing</span>
                      ) : (
                        <CostRow cost={result.earned} />
                      )}
                    </div>
                    {/* the ladder is finite and ends at Extreme,
                        so the last first-clear has nothing to unlock — it
                        finishes the campaign instead */}
                    {result.firstClear && (
                      <div className="pt-1 text-[12px] uppercase tracking-widest text-[#FFD37F]">
                        {result.tier >= TOP_TIER
                          ? "Campaign complete — every wave cleared"
                          : `${difficultyName(result.tier + 1)} unlocked`}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="mt-6 flex justify-center">
                <button
                  onClick={backToMenu}
                  className="rounded border border-[#7BE58A] bg-[#14271C]/90 px-6 py-2 text-base font-bold uppercase tracking-widest text-[#7BE58A] hover:bg-[#1A3324] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7BE58A]"
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
              <div className="text-xl font-bold uppercase tracking-widest text-[#EDEDEF]">
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
                  className="rounded border border-[#FFD37F] bg-[#222227]/90 px-5 py-2 text-base font-bold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Resume
                </button>
                <button
                  onClick={backToMenu}
                  className="rounded border border-[#3A2430] px-5 py-2 text-base font-bold uppercase tracking-widest text-[#FF8A8A] hover:border-[#FF5A5A] hover:bg-[#2A1620]/80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF5A5A]"
                >
                  Abandon run
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
