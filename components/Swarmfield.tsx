"use client";

import { useEffect, useRef, useState } from "react";
import {
  BASE_SPEEDS,
  firstLoadStep,
  Game,
  LOAD_STEP_LABEL,
  LOAD_STEPS,
  SPEEDS,
  type LoadStep,
  type UiState,
} from "@/game/game";
import { loadBalanceDoc } from "@/game/balance";
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
  difficultyColor,
  difficultyName,
  specForTier,
  waveCost,
  waveGuide,
  tierDropBonus,
  tierLevel,
  TOP_TIER,
} from "@/game/ladder";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import {
  grantRunReward,
  isTierCleared,
  loadProgress,
  resetProgress,
  saveLayout,
  saveSpeed,
  startingSpeed,
  techOf,
  topTier,
  type Progress,
  type RunReward,
} from "@/game/progress";
import { turretIcon } from "@/game/atlas";
import { isEmpty, ITEM_INFO, itemForTier } from "@/game/items";
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
            <span className="font-bold" style={{ color: difficultyColor(level.tier ?? 0) }}>
              {difficultyName(level.tier ?? 0)}
            </span>{" "}
            — {waves} waves — {enemies} enemies
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
  const { waves } = levelSummary(spec);
  const step = (d: number): void => onTier(Math.min(top, Math.max(0, tier + d)));
  // the salvage multiplier as the one number in the blurb — "30% more loot"
  const lootPct = Math.round((tierDropBonus(tier) - 1) * 100);
  // what a difficulty NEWLY drops: its top tier's currency. Tier 0's spread
  // (copper through thorium) is the baseline, so it gets prose instead
  const newDrop = ITEM_INFO[itemForTier(tier + 3)].name.toLowerCase();

  return (
    <div className="w-full max-w-[22rem] rounded-lg border border-[#2E2E36] bg-[#151518]/70 p-4">
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
          <div
            className="text-2xl font-bold uppercase leading-none tracking-[0.15em]"
            style={{ color: difficultyColor(tier) }}
          >
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

      {/* the wave count and one sentence of what the tier means — the full
          numbers (enemy level, hp multiple, exact salvage) live in the run
          itself and the editor, not on the menu */}
      <div className="mt-3 border-t border-[#2E2E36] pt-3 text-[13px] leading-snug">
        <span className="font-bold text-[#EDEDEF]">{waves} waves.</span>{" "}
        <span className="text-[#A6A6AF]">
          {tier === 0 ? (
            <>The swarm at base strength — every kill drops resources for the tech tree.</>
          ) : (
            <>
              Enemies have more health and shields, but drop {newDrop} and{" "}
              <span className="font-bold text-[#7BE58A]">{lootPct}% more loot</span>.
            </>
          )}
        </span>
      </div>

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
    kind: "arc",
    name: "Arc",
    icon: "/mindustry/sprites/blocks/turrets/arc.png",
  },
  {
    kind: "lancer",
    name: "Lancer",
    icon: "/mindustry/sprites/blocks/turrets/lancer.png",
  },
  {
    kind: "ripple",
    name: "Ripple",
    icon: "/mindustry/sprites/blocks/turrets/ripple.png",
  },
  {
    kind: "parallax",
    name: "Parallax",
    icon: "/mindustry/sprites/blocks/defense/parallax.png",
  },
  {
    kind: "fuse",
    name: "Fuse",
    icon: "/mindustry/sprites/blocks/turrets/fuse.png",
  },
  {
    kind: "swarmer",
    name: "Swarmer",
    icon: "/mindustry/sprites/blocks/turrets/swarmer.png",
  },
  {
    kind: "cyclone",
    name: "Cyclone",
    icon: "/mindustry/sprites/blocks/turrets/cyclone/cyclone-preview.png",
  },
  {
    kind: "spectre",
    name: "Spectre",
    icon: "/mindustry/sprites/blocks/turrets/spectre.png",
  },
  {
    kind: "meltdown",
    name: "Meltdown",
    icon: "/mindustry/sprites/blocks/turrets/meltdown.png",
  },
  {
    kind: "foreshadow",
    name: "Foreshadow",
    icon: "/mindustry/sprites/blocks/turrets/foreshadow.png",
  },
];

/** the two wave buttons in the HUD, sized to be hit without aiming */
const WAVE_BTN =
  "flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#2E2E36] text-[#FFD37F] hover:border-[#FFD37F] hover:bg-[#222227]/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]";

/**
 * Pause and the game menu, as buttons. Both already have a key — space and
 * esc — and a touchscreen has neither, so the same two live in the corner of
 * the field at a size a thumb can hit (44px is the platform minimum).
 */
const ICON_BTN =
  "flex h-11 w-11 items-center justify-center rounded border bg-[#151518]/70 backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]";

/** every button in the bottom bar: the turrets and the demolish tool */
const TOOL_BTN =
  "flex h-[4.5rem] w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded border backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]";


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
  const granted = useRef(false);
  /**
   * Where the tech tree was opened FROM. A loss is the moment the tree is
   * most worth reading — the run just banked everything its towers killed on
   * the way down — so the defeat panel offers it, and leaving from there has
   * to come back to the run rather than dump the player on the level list.
   */
  const [techFrom, setTechFrom] = useState<"menu" | "game">("menu");

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
    const tech = techOf(loadProgress());
    g.setTech(admin ? null : tech);
    // dropping out of sandbox drops a sandbox-only pace with it, or the run
    // keeps running at a speed whose button is no longer on screen. What the
    // save allows is the utilities path rather than a constant, so it falls
    // back the same way a fresh run starts: the remembered pace, stepped
    // down to the fastest one this save actually owns
    if (!admin && !tech.speeds.includes(g.ui().speed))
      g.setSpeed(startingSpeed(loadProgress(), tech.speeds));
    setHud(g.ui());
  }, [admin]);

  useEffect(() => {
    let alive = true;
    // level documents overlay WORLDS in place (see levels.ts), so a script
    // edited in the admin level editor is what the menu counts and the run
    // plays. A level with no document keeps the campaign as shipped
    Promise.all([loadOfficialMaps(), loadLevelDocs(), loadBalanceDoc()])
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
        const save = loadProgress();
        g.setTech(admin ? null : techOf(save));
        // the pace carries across runs and across sessions — a player who
        // plays at 4x wants 4x again after a loss, not 1x and a click
        g.setSpeed(startingSpeed(save, admin ? SPEEDS : techOf(save).speeds));
        // stand last run's emplacements back up before the first wave. Tech
        // is applied first because placeTower checks capacity, so restoring
        // ahead of it would silently drop everything past the default caps
        const saved = save.layouts?.[g.mapId()];
        if (saved && saved.length > 0) g.applyLayout(saved);
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
        // the layout is saved on the RUN ENDING rather than on every
        // placement: mid-run it is still changing, and a run abandoned from
        // the pause menu should leave the last finished layout alone
        saveLayout(g.mapId(), g.layout());
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

  /**
   * The demolish tool. On a mouse it doubles the right button; on a
   * touchscreen it is the only way to sell at all, so it is a mode picked
   * from the bar rather than a modifier held down.
   */
  const toggleSell = (): void => {
    const g = gameRef.current;
    if (!g) return;
    g.setSellMode(!hud?.sellMode);
    setHud(g.ui());
  };

  const togglePause = (): void => {
    const g = gameRef.current;
    if (!g) return;
    g.togglePause();
    setHud(g.ui());
  };

  const openMenu = (): void => {
    const g = gameRef.current;
    if (!g) return;
    g.openMenu();
    setHud(g.ui());
  };

  const backToMenu = (): void => {
    granted.current = false;
    setResult(null);
    setProgress(loadProgress());
    setScreen("menu");
  };

  /**
   * Leave the tech tree. From the menu that is just the level list; from a
   * lost run it restarts the run — the screen switch tears the Game down and
   * rebuilds it, and Game.create reads the save, so whatever was just bought
   * is already fielded. The grant latch has to be cleared or the new run
   * would end without paying out.
   */
  const leaveTech = (): void => {
    if (techFrom !== "game") {
      setScreen("menu");
      return;
    }
    granted.current = false;
    setResult(null);
    setProgress(loadProgress());
    setScreen("game");
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
    // reset() clears the field, so the layout has to be stood back up here
    // too — Retry rebuilds the sim in place and never goes through the
    // create effect that restores it on a fresh mount
    const saved = loadProgress().layouts?.[g.mapId()];
    if (saved && saved.length > 0) g.applyLayout(saved);
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
        onBack={leaveTech}
        backLabel={techFrom === "game" ? "◂ Restart run" : undefined}
      />
    );
  }

  if (screen !== "game" || !level) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-[#101013]">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-8 py-12 pl-[max(1.5rem,var(--safe-l))] pr-[max(1.5rem,var(--safe-r))] sm:py-16">
          <div className="text-center">
            <h1 className="text-3xl font-bold uppercase tracking-[0.2em] text-[#EDEDEF] sm:text-4xl sm:tracking-[0.35em]">
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
                onClick={() => {
                  setTechFrom("menu");
                  setScreen("tech");
                }}
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
    // touch-none hands every gesture over the field to Game: without it the
    // browser claims the drag for a scroll and the pinch for a page zoom, and
    // the map underneath never moves. select-none and the callout keep a
    // press-and-drag from turning into a text selection or an iOS share sheet
    <div className="fixed inset-0 overflow-hidden bg-black select-none [-webkit-touch-callout:none]">
      <div className="relative h-full w-full">
        <canvas
          ref={glRef}
          width={2560}
          height={1440}
          className="block h-full w-full touch-none"
        />
        <canvas
          ref={uiRef}
          width={2560}
          height={1440}
          className={`absolute inset-0 h-full w-full touch-none ${
            hud?.buildKind || hud?.sellMode ? "cursor-crosshair" : "cursor-default"
          }`}
        />
        {loadUi && (
          <LoadingScreen level={level} step={loadUi.step} out={loadUi.out} />
        )}
        {hud?.paused && (
          // on a phone the wave panel already fills the top of the screen, so
          // the badge drops onto the map rather than landing on top of it
          <div className="absolute left-1/2 top-[30%] -translate-x-1/2 rounded border border-[#E8B45B] bg-[#151518]/70 px-3 py-1.5 text-base font-bold uppercase tracking-widest text-[#E8B45B] backdrop-blur sm:top-[calc(1rem+var(--safe-t))]">
            Paused
          </div>
        )}
        {/* one thin bar per boss on the field, stacked top-centre and keyed
            by spawn id so a bar never trades places with its neighbour.
            pointer-events-none: it is a readout, never a control */}
        {hud && hud.bosses.length > 0 && (
          <div className="pointer-events-none absolute left-1/2 top-[calc(0.75rem+var(--safe-t))] z-10 flex w-[min(40vw,22rem)] -translate-x-1/2 flex-col gap-1.5">
            {hud.bosses.map((b) => (
              <div key={b.id}>
                <div className="mb-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-[#F25555] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
                  {b.kind}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full border border-[#2E2E36] bg-[#151518]/80">
                  <div
                    className="h-full rounded-full bg-[#F25555] transition-[width] duration-150 ease-linear"
                    style={{ width: `${Math.max(0, Math.min(100, (100 * b.hp) / b.max))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {/* one fixed width for the whole top-left stack, so the panel does
            not breathe in and out as counters change and the skip box lines
            up under it. Everything inside wraps rather than widening it */}
        {hud && (
          <div className="absolute left-[calc(1rem+var(--safe-l))] top-[calc(1rem+var(--safe-t))] flex w-80 max-w-[calc(100vw-8rem-var(--safe-l)-var(--safe-r))] flex-col items-stretch gap-2">
            <div className="w-full rounded border border-[#2E2E36] bg-[#151518]/70 px-3 py-1.5 backdrop-blur">
              {/* the wave counter is what a run is read off, so the line
                  carries that and the difficulty and nothing else — the level
                  name is on the card that launched it */}
              <div className="text-[13px] uppercase tracking-widest text-[#EDEDEF] break-words">
                <span className="font-bold" style={{ color: difficultyColor(hud.tier) }}>
                  {difficultyName(hud.tier)}
                </span>{" "}
                — Wave{" "}
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
              {/* the countdown and the button that cuts it short. Both are
                  conditional on there being a wave still pending — with the
                  script drained there is nothing left to release */}
              <div className="flex flex-wrap items-center gap-2 text-[13px] uppercase tracking-widest text-[#EDEDEF]">
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
              </div>
            </div>
          </div>
        )}
        {hud && !hud.lost && !hud.won && !hud.menuOpen && (
          /* pace controls, for everyone: an idle game where the only way to
             sit out a wave gap is to watch it is a game that wastes the
             player's time. Pause leads, since it is the one that stops the
             clock; the multipliers run out from it.
             Pause and the game menu are also the two controls a touchscreen
             has no key for, so having them on screen is what makes space and
             esc optional rather than required */
          <div
            role="group"
            aria-label="speed controls"
            className="absolute bottom-[calc(1rem+var(--safe-b))] left-[calc(1rem+var(--safe-l))] flex overflow-hidden rounded border border-[#2E2E36] bg-[#151518]/70 backdrop-blur"
          >
            <button
              title={hud.paused ? "Resume (space)" : "Pause (space)"}
              aria-label={hud.paused ? "Resume" : "Pause"}
              aria-pressed={hud.paused}
              onClick={() => {
                const g = gameRef.current;
                if (!g) return;
                g.togglePause();
                setHud(g.ui());
              }}
              className={`border-r border-[#2E2E36] px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                hud.paused
                  ? "bg-[#222227] text-[#E8B45B]"
                  : "text-[#EDEDEF] hover:bg-[#222227]/60"
              }`}
            >
              <svg viewBox="0 0 12 12" className="h-4 w-4 fill-current" aria-hidden="true">
                {hud.paused ? (
                  <path d="M2.5 1.5v9l8-4.5z" />
                ) : (
                  <path d="M2 1.5h3v9H2zM7 1.5h3v9H7z" />
                )}
              </svg>
            </button>
            {/* what a save may run at is bought on the utilities path
                (tech.ts); sandbox ignores the tree and offers all of them */}
            {(admin ? SPEEDS : progress ? techOf(progress).speeds : BASE_SPEEDS).map((mult) => (
              <button
                key={mult}
                title={`${mult}x speed`}
                aria-pressed={hud.speed === mult}
                onClick={() => {
                  const g = gameRef.current;
                  if (!g) return;
                  g.setSpeed(mult);
                  saveSpeed(mult);
                  setHud(g.ui());
                }}
                className={`px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                  hud.speed === mult
                    ? "bg-[#222227] text-[#FFD37F]"
                    : "text-[#EDEDEF] hover:bg-[#222227]/60"
                }`}
              >
                {mult}x
              </button>
            ))}
          </div>
        )}
        {hud && !hud.lost && !hud.won && !hud.menuOpen && (
          <div
            role="group"
            aria-label="view and menu"
            className="absolute right-[calc(1rem+var(--safe-r))] top-[calc(1rem+var(--safe-t))] flex items-start gap-2"
          >
            {/* the swarm's entry points, and the lines flyers fly out of
                them. Walkers read off the terrain — flyers ignore it, so
                where they come from and what they cross is the question
                this answers */}
            <button
              aria-pressed={hud.showRoutes}
              title="Show enemy drop zones and the routes flyers take"
              onClick={() => {
                const g = gameRef.current;
                if (!g) return;
                g.toggleRoutes();
                setHud(g.ui());
              }}
              className={`rounded border px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                hud.showRoutes
                  ? "border-[#FFD37F] bg-[#222227]/90 text-[#FFD37F]"
                  : "border-[#2E2E36] bg-[#151518]/70 text-[#EDEDEF] hover:border-[#4A4A55]"
              }`}
            >
              Spawns &amp; routes
            </button>
            {/* the same menu esc raises — a pointer needs a way in too */}
            <button
              aria-label="Game menu"
              title="Game menu (Esc)"
              onClick={() => {
                const g = gameRef.current;
                if (!g) return;
                g.openMenu();
                setHud(g.ui());
              }}
              className="rounded border border-[#2E2E36] bg-[#151518]/70 p-[6px] text-[#EDEDEF] backdrop-blur hover:border-[#4A4A55] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.21.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                />
              </svg>
            </button>
          </div>
        )}
        {/* The bar scrolls sideways instead of wrapping: ten turrets do not
            fit across a phone, and a second row would eat the field. The
            scroller itself is click-through so the map keeps the space to
            either side of the buttons. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1rem+var(--safe-b))] overflow-x-auto pb-1 pl-[calc(1rem+var(--safe-l))] pr-[calc(1rem+var(--safe-r))]">
          <div
            role="group"
            aria-label="tower menu"
            className="pointer-events-auto mx-auto flex w-max gap-2"
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
                  className={`${TOOL_BTN} ${
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
            {/* demolish rides in the bar with the turrets because on a
                touchscreen it is a tool like they are — there is no right
                button to hold instead */}
            {hud && (
              <button
                title="Demolish (or right-click)"
                aria-label="Demolish"
                aria-pressed={hud.sellMode}
                onClick={toggleSell}
                className={`${TOOL_BTN} ${
                  hud.sellMode
                    ? "border-[#FF5A5A] bg-[#2A1620]/90 text-[#FF5A5A]"
                    : "border-[#2E2E36] bg-[#151518]/70 text-[#A6A6AF] hover:border-[#4A4A55]"
                }`}
              >
                <svg viewBox="0 0 12 12" className="h-8 w-8 fill-current" aria-hidden="true">
                  <path d="M4.6 1.1h2.8l.6 1h2v1.2H2V2.1h2zM2.9 4.6h6.2l-.5 6.3H3.4z" />
                </svg>
                <span className="text-[11px] font-bold uppercase leading-none tracking-widest">
                  Sell
                </span>
              </button>
            )}
          </div>
        </div>
        {hud?.lost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-80 max-w-[calc(100vw-2rem)] rounded border border-[#3A2430] bg-[#151518]/95 p-6 text-center">
              <div className="text-xl font-bold uppercase tracking-widest text-[#FF5A5A]">
                Core destroyed
              </div>
              <div className="mt-4 space-y-1 text-base text-[#EDEDEF]">
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
              <div className="mt-6 space-y-3">
                {/* the salvage above is spendable RIGHT NOW, and spending it
                    is the only thing that changes the next attempt — so the
                    tree leads, and a plain retry sits under it */}
                <button
                  onClick={() => {
                    setTechFrom("game");
                    setScreen("tech");
                  }}
                  className="w-full rounded border border-[#FFD37F] bg-[#222227]/90 px-5 py-2 text-base font-bold uppercase tracking-widest text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Upgrades
                </button>
                <div className="flex justify-center gap-3">
                <button
                  onClick={retry}
                  className="rounded border border-[#2E2E36] px-5 py-2 text-base font-bold uppercase tracking-widest text-[#EDEDEF] hover:border-[#4A4A55] hover:bg-[#222227]/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Retry
                </button>
                <button
                  onClick={backToMenu}
                  className="rounded border border-[#2E2E36] px-5 py-2 text-base font-bold uppercase tracking-widest text-[#EDEDEF] hover:border-[#4A4A55] hover:bg-[#222227]/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Levels
                </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {hud?.won && !hud.lost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-80 max-w-[calc(100vw-2rem)] rounded border border-[#1F3A2E] bg-[#151518]/95 p-6 text-center">
              <div className="text-xl font-bold uppercase tracking-widest text-[#7BE58A]">
                <span style={{ color: difficultyColor(hud.tier) }}>
                  {difficultyName(hud.tier)}
                </span>{" "}
                cleared
              </div>
              <div className="mt-4 space-y-1.5 text-base text-[#EDEDEF]">
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {result && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#2E2E36] pt-1.5">
                      <span className="font-bold text-[#EDEDEF]">
                        Salvaged
                        <span className="ml-1 font-normal text-[#EDEDEF]">
                          ×{result.dropBonus.toFixed(2)}
                        </span>
                      </span>
                      {isEmpty(result.earned) ? (
                        <span className="text-[#EDEDEF]">nothing</span>
                      ) : (
                        <CostRow cost={result.earned} />
                      )}
                    </div>
                    {/* the ladder is finite and ends at Nemesis,
                        so the last first-clear has nothing to unlock — it
                        finishes the campaign instead */}
                    {result.firstClear && (
                      <div className="pt-1 text-[12px] uppercase tracking-widest text-[#FFD37F]">
                        {result.tier >= TOP_TIER ? (
                          "Campaign complete — every wave cleared"
                        ) : (
                          <>
                            <span style={{ color: difficultyColor(result.tier + 1) }}>
                              {difficultyName(result.tier + 1)}
                            </span>{" "}
                            unlocked
                          </>
                        )}
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
            <div className="w-72 max-w-[calc(100vw-2rem)] rounded border border-[#2E2E36] bg-[#151518]/95 p-6 text-center">
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
