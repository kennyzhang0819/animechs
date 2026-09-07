"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  missionText,
  waveGroups,
  WORLD,
  worldById,
  WORLDS,
  type LevelSpec,
  type TowerKind,
} from "@/game/levels";
import {
  audit,
  budget,
  check,
  rungColor,
  rungLabel,
  RUNG_COUNT,
  specForTier,
  stageAudit,
  stageTable,
  waveCost,
  waveGuide,
  tierLevel,
  tierMutationCount,
  tierMutationPoints,
  tierXpBonus,
} from "@/game/ladder";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import {
  bestClearOn,
  grantRunReward,
  loadProgress,
  resetProgress,
  saveEffects,
  saveUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALES,
  saveHudMinimized,
  saveLoadout,
  saveRunPick,
  saveSpeed,
  startingSpeed,
  techOf,
  worldLock,
  type Progress,
  type RunReward,
} from "@/game/progress";
import { turretIcon } from "@/game/atlas";
import {
  cleanMutations,
  mutationById,
  mutationsInForce,
  rollMutations,
  type MutationDef,
  type MutationId,
} from "@/game/mutation";
import { BY_MINDUSTRY_VALUE } from "@/game/tech";
import { rewardsAt, rewardText, turretUnlockLevel } from "@/game/track";
import { levelProgress, POINT_COLOR, RANDOM_MAP_XP_BONUS, XP_COLOR } from "@/game/economy";
import { itemCount, LevelStrip, ScrapAmount, XpAmount } from "./Items";
import ProgressView from "./Progress";
import { bandFor, MutationFace } from "./mutationFace";
import MenuBackground from "./MenuBackground";

/** the level card's map preview — the admin editor's thumbnail look */
function LevelThumb({ mapId, bare = false }: { mapId: string; bare?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const m = loadMap(mapId);
    if (m && ref.current) drawThumb(m, ref.current);
  }, [mapId]);
  // fixed-aspect frame: maps differ in proportion (a taller world 2 next to
  // a wide world 1), and letting each canvas set its own height left the
  // cards ragged. The preview sits centred inside a constant box instead.
  // `bare` drops the frame's own border and fill: on the menu the thumb is
  // already inside the card's border, and the second box around it read as
  // a picture of a map rather than as the map
  return (
    <div
      className={`flex aspect-[16/9] items-center justify-center overflow-hidden${
        bare ? "" : " ms-pane-solid"
      }`}
    >
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
function LoadingScreen({ step, out }: { step: LoadStep; out: boolean }) {
  // NOTHING ABOUT THE RUN. No map, no tier, no wave count: what is coming is
  // the run's own answer to give, wave by wave, and a preview printed before
  // the first enemy lands is something the player can do nothing with. The
  // screen says it is loading and shows how far along it is, and stops there

  // steps, not bytes: nothing here streams, so the bar fills a stage at a
  // time rather than pretending to a percentage it cannot know
  const done = LOAD_STEPS.indexOf(step) + 1;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`absolute inset-0 z-20 flex items-center justify-center bg-[#0b0b0d] transition-opacity duration-[260ms] ${
        out ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-6 px-8">
        <h2 className="font-display text-3xl font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
          Loading
        </h2>
        <div className="flex w-full flex-col gap-2">
          <div className="ms-bar w-full">
            <div
              className="transition-[width] duration-200 ease-out"
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

/**
 * THE LEVEL LINE ON A RESULTS PANEL: "Level 4 → 6" when the run climbed,
 * else how far into the current level the save now stands. A run that
 * banked XP and moved nothing visible would read as a run that paid
 * nothing, so the bar is always there.
 */
/** seconds as m:ss — the survive clock's face */
const clock = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The map bonus, named on the results panel when it was paid: the run's
 * multiplier already includes it (RunReward.xpBonus), and a player who
 * left the map on Random should see what that was worth.
 */
function RandomMapLine({ result }: { result: RunReward }) {
  if (!result.randomMap) return null;
  return (
    <div className="pt-1 text-[12px] uppercase tracking-widest text-[#A6A6AF]">
      Random map{" "}
      <span className="font-bold" style={{ color: XP_COLOR }}>
        {xpBonusText(1 + RANDOM_MAP_XP_BONUS)}
      </span>
    </div>
  );
}

function LevelUpLine({ result }: { result: RunReward }) {
  const p = loadProgress();
  const { level, into, need } = levelProgress(p.xp);
  const climbed = result.levelAfter > result.levelBefore;
  // everything the climb handed out, every level of it — the reason a
  // results screen is worth reading
  const earned: string[] = [];
  for (let l = result.levelBefore + 1; l <= result.levelAfter; l++)
    for (const r of rewardsAt(l)) earned.push(rewardText(r));
  return (
    <div className="pt-1 text-[12px] uppercase tracking-widest text-[#A6A6AF]">
      {climbed ? (
        <>
          <div>
            Level <span style={{ color: POINT_COLOR }}>{result.levelBefore}</span> →{" "}
            <span className="font-bold" style={{ color: POINT_COLOR }}>
              {result.levelAfter}
            </span>
          </div>
          {earned.length > 0 && (
            <div className="mt-1 flex flex-wrap justify-center gap-1">
              {earned.map((t, i) => (
                <span key={i} className="ms-badge text-[#FFD37F]">
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          Level <span style={{ color: POINT_COLOR }}>{level}</span> ·{" "}
          {itemCount(into)} / {itemCount(need)} XP
        </>
      )}
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
 * THE SPEC A RUN IS ACTUALLY PLAYED ON: the ladder's expansion of the
 * picked rung, plus the mutators rolled for it (mutation.ts).
 *
 * ONLY THE ROLL GOES IN `mutation`. A world's own rules
 * (LevelSpec.intrinsicMutation) are already on the spec this spreads, and
 * the sim unions the two itself (mutationsInForce) — copying them in here
 * as well would make "what was rolled" unanswerable, which the points line
 * on the deploy panel needs to stay honest.
 *
 * The two are joined HERE and not in specForTier, because they answer
 * different questions and the audit arithmetic only wants one of them: a
 * rung is what the campaign sends, a mutator is what happens to it on the
 * way in. Everything ladder.ts counts stays true either way — a mutator
 * changes a wave after it spawns, never what spawns.
 *
 * THE ROLL IS PASSED IN, NOT MADE HERE, and that is the whole reason this
 * takes a third argument. The deploy panel SHOWS the rules before the
 * button is pressed; rolling again on the press would deploy a run under
 * rules the player was never shown, which is the one thing a mode built
 * on a surprise roll cannot afford to do.
 */
const runSpec = (
  world: LevelSpec,
  tier: number,
  mutation: readonly MutationId[],
): LevelSpec => ({
  ...specForTier(world, tier),
  ...(mutation.length > 0 ? { mutation } : null),
});

/**
 * ONE RULE IN THE DEPLOY DIALOG: its face in a bordered square, and the
 * sentence in a card that opens on hover.
 *
 * IT IS THE CODEX TILE WITH THE BOARD TAKEN OUT — same face, same band
 * colour on the border, same hover card. What it drops is the name under
 * the square and the geometry around it: this is a row inside a dialog,
 * not a shelf on a board.
 *
 * THE CARD OPENS UPWARD. Everything below this row is the Deploy button
 * and the bottom of the panel, so a card hanging down would either be
 * clipped or would cover the one control the dialog exists to offer.
 */
function MutationChip({
  def,
  always,
  fromRight,
}: {
  def: MutationDef;
  /** a rule the WORLD carries rather than one the difficulty rolled */
  always: boolean;
  /**
   * Hang the card off this chip's RIGHT edge instead of its left.
   *
   * The card is wider than the whole row of chips, so one anchored left
   * under the last chip runs off a narrow landscape phone entirely — 43px
   * of it, measured, at 667px wide. Chips in the right half of the row
   * open leftward instead, which keeps every card inside the dialog
   * without measuring anything at runtime.
   */
  fromRight: boolean;
}) {
  const band = bandFor(def);
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`${def.name}: ${band.label} mutator${always ? ", always in force on this map" : ""}. ${def.blurb}`}
        className="flex h-7 w-7 items-center justify-center border-2 bg-[#0b0b0d] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF8ACB]"
        style={{ borderColor: band.color }}
      >
        <MutationFace id={def.id} size="h-5 w-5" />
      </button>
      {/* what this rule does — opened by resting on the chip, or by
          focusing it from the keyboard */}
      <div
        className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-56 border-[3px] p-2.5 text-left shadow-lg group-hover:block group-focus-within:block ${
          fromRight ? "right-0" : "left-0"
        }`}
        style={{ borderColor: band.color, background: "#0b0b0d" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-[#EDEDEF]">{def.name}</span>
          <span
            className="shrink-0 text-[11px] font-bold uppercase tracking-widest"
            style={{ color: band.color }}
          >
            {/* the weight, whether or not the world carries this rule.
                A map-bound rule already reads as SPECIAL in its own blue,
                so the corner is free to say the one thing every card says
                in the same place: how heavy this is */}
            {band.label}
          </span>
        </div>
        <div className="mt-1 text-[12.5px] leading-snug text-[#A6A6AF]">{def.blurb}</div>
      </div>
    </div>
  );
}

/**
 * A MACRO — one of the two dials on the start screen, printed as a row:
 * what it is on the left, what it is set to on the right, and the whole
 * row a button that opens the list to change it. The value is what a
 * player reads at a glance ("Random · +25% XP", "Level 4 · +90% XP"), so
 * it gets the ink and the label sits small beside it.
 */
function MacroButton({
  label,
  value,
  onClick,
  children,
}: {
  label: string;
  /** the setting in words, for the accessible name — the children are its face */
  value: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label}: ${value}. Change`}
      className="ms-btn w-full justify-between gap-3 px-4 py-3 text-left"
    >
      <span className="text-[11px] tracking-[0.3em] text-[#a2a2a2]">{label}</span>
      <span className="flex items-center gap-2 text-[14px] tracking-[0.12em]">
        {children}
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[#71717C]" aria-hidden="true">
          <path d="M9.3 5.1 16.2 12l-6.9 6.9-1.7-1.7L12.8 12 7.6 6.8z" />
        </svg>
      </span>
    </button>
  );
}

/**
 * THE LIST BEHIND A MACRO: a panel over the start screen holding the
 * choices, one row each, the current one marked. It closes on a pick, on
 * Escape and on a click outside — every way a dialog anyone has met
 * closes — and it never carries a second control: the only question it
 * asks is "which".
 *
 * It sits OUTSIDE the menu's zoom wrapper on purpose: `ui-zoom` is a CSS
 * `zoom`, and a fixed backdrop inside one covers the scaled box rather
 * than the viewport. The panel carries its own ui-zoom, so the UI-size
 * knob still moves it.
 */
function PickerDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="ui-zoom ms-pane-solid flex max-h-[calc(100vh-2rem)] w-full max-w-[26rem] flex-col p-4 shadow-2xl"
      >
        <h2 className="ms-heading mb-3 text-[13px] tracking-[0.35em]">{title}</h2>
        <div role="listbox" className="flex min-h-0 flex-col gap-1.5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

/** one choice in a picker: a bordered row, gold when it is the current one */
function PickRow({
  selected,
  disabled = false,
  onPick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={onPick}
      disabled={disabled}
      className={`ms-pane-solid flex w-full items-center gap-3 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD37F] ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : selected
            ? "border-[#FFD37F]"
            : "hover:border-[#A6A6AF]"
      }`}
    >
      {children}
    </button>
  );
}

/** a multiplier as the extra it pays: x1.30 prints as "+30% XP", x1 as "Base XP" */
const xpBonusText = (mult: number): string => {
  const pct = Math.round((mult - 1) * 100);
  return pct > 0 ? `+${pct}% XP` : "Base XP";
};

/**
 * THE MAP LIST. Random leads and is the default: the game picks any open
 * map on Start, and pays RANDOM_MAP_XP_BONUS for the trust. Under it,
 * every world — a locked one is on the list saying what opens it, never
 * hidden, and a played one says the best level beaten on it. No map is
 * ranked against another: every map is as hard as the level it is played
 * at, and the level is the other macro.
 */
function MapPicker({
  progress,
  pick,
  mapsReady,
  onPick,
  onClose,
}: {
  progress: Progress;
  /** the world picked, or null for Random */
  pick: string | null;
  mapsReady: boolean;
  onPick: (worldId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <PickerDialog title="Map" onClose={onClose}>
      <PickRow selected={pick == null} onPick={() => onPick(null)}>
        <div className="flex aspect-[16/9] w-20 shrink-0 items-center justify-center bg-[#0b0b0d] text-[#FFD37F]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="8" cy="8" r="1.7" fill="currentColor" />
            <circle cx="16" cy="8" r="1.7" fill="currentColor" />
            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            <circle cx="8" cy="16" r="1.7" fill="currentColor" />
            <circle cx="16" cy="16" r="1.7" fill="currentColor" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[14px] font-bold uppercase tracking-widest text-[#EDEDEF]">
            Random
          </div>
          <div className="text-[11px] text-[#71717C]">Any open map, picked on start</div>
        </div>
        <span
          className="shrink-0 text-[12px] font-bold uppercase tracking-widest"
          style={{ color: XP_COLOR }}
        >
          {xpBonusText(1 + RANDOM_MAP_XP_BONUS)}
        </span>
      </PickRow>
      {WORLDS.map((w) => {
        const lock = worldLock(progress, w.id);
        const best = bestClearOn(progress, w.id);
        return (
          <PickRow
            key={w.id}
            selected={pick === w.id}
            disabled={lock != null}
            onPick={() => onPick(w.id)}
          >
            <div className={`w-20 shrink-0 ${lock ? "grayscale" : ""}`}>
              {mapsReady ? (
                <LevelThumb mapId={w.map ?? OFFICIAL_MAP_IDS[0]} bare />
              ) : (
                <div className="aspect-[16/9] bg-[#0b0b0d]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[14px] font-bold uppercase tracking-widest text-[#EDEDEF]">
                {w.name}
              </div>
              <div className="truncate text-[11px] text-[#71717C]">{missionText(w).title}</div>
            </div>
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-[#71717C]">
              {lock ? (
                <>
                  Opens at <span style={{ color: POINT_COLOR }}>level {lock.level}</span>
                </>
              ) : best > 0 ? (
                <>
                  Best <span style={{ color: rungColor(best - 1) }}>{rungLabel(best - 1)}</span>
                </>
              ) : (
                "New"
              )}
            </span>
          </PickRow>
        );
      })}
    </PickerDialog>
  );
}

/**
 * THE DIFFICULTY LIST: the ten levels, every one open, each saying what
 * it pays over Level 1 — the whole trade in one column. Scrap is the same
 * on every level (the run is priced against the script, not the rung),
 * so the only thing a higher level buys is XP, and the only thing it
 * costs is the rules it rolls; both are on the row.
 */
function DifficultyPicker({
  tier,
  onPick,
  onClose,
}: {
  tier: number;
  onPick: (tier: number) => void;
  onClose: () => void;
}) {
  return (
    <PickerDialog title="Difficulty" onClose={onClose}>
      {Array.from({ length: RUNG_COUNT }, (_, t) => {
        const rules = tierMutationCount(t);
        return (
          <PickRow key={t} selected={t === tier} onPick={() => onPick(t)}>
            <span
              className="w-24 shrink-0 font-display text-[15px] font-bold uppercase tracking-widest"
              style={{ color: rungColor(t) }}
            >
              {rungLabel(t)}
            </span>
            <span className="min-w-0 flex-1 text-[11px] text-[#71717C]">
              {rules === 0
                ? "As authored — no mutators"
                : `${rules} mutator${rules === 1 ? "" : "s"} rolled`}
            </span>
            <span
              className="shrink-0 text-[12px] font-bold uppercase tracking-widest"
              style={{ color: XP_COLOR }}
            >
              {xpBonusText(tierXpBonus(t))}
            </span>
          </PickRow>
        );
      })}
    </PickerDialog>
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
    kind: "wave",
    name: "Wave",
    icon: "/mindustry/sprites/blocks/turrets/wave.png",
  },
  {
    kind: "parallax",
    name: "Parallax",
    icon: "/mindustry/sprites/blocks/defense/parallax.png",
  },
  {
    kind: "tsunami",
    name: "Tsunami",
    icon: "/mindustry/sprites/blocks/turrets/tsunami.png",
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

/** menu entry by kind, for rendering the bar from a list of kinds */
const MENU_BY_KIND = new Map(TOWER_MENU.map((t) => [t.kind, t]));

/**
 * The menu in the game's ONE canonical order — the admin balance panel's
 * cheapest-first Mindustry ranking (BY_MINDUSTRY_VALUE). The bar and the
 * loadout picker both read in it, so a turret keeps its place wherever it
 * shows up: enable foreshadow and it is always last, whenever it was picked.
 */
const ORDERED_MENU: ReadonlyArray<(typeof TOWER_MENU)[number]> = BY_MINDUSTRY_VALUE.map(
  (k) => MENU_BY_KIND.get(k)!,
);

/** every button in the bottom bar: the turrets and the demolish tool */
const TOOL_BTN = "ms-btn h-[4.5rem] w-14 shrink-0 flex-col gap-0.5 p-0";


export default function MechSwarm() {
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
  /**
   * WHERE IN THE FRONT-OF-HOUSE THE PLAYER IS. The menu screen is three
   * panels, not one: a title card, settings, and the DEPLOY screen behind
   * Start — the two macros a run is chosen by (map and difficulty) and
   * the button that starts it. Each macro opens its list as a dialog over
   * the deploy screen (`picker`), so choosing a run never leaves the
   * screen it is started from.
   *
   * The title card shows a game and two buttons and NOTHING else — no map,
   * no level, no difficulty. Everything that describes a run lives behind
   * Start, where it describes something the player is about to do.
   *
   * It is deliberately NOT part of `screen`: leaving a run or the tech tree
   * comes back to "menu" from several places, and this survives all of
   * them, so a player who deploys, loses, and backs out lands on the deploy
   * screen with their picks rather than at the title.
   */
  const [menuView, setMenuView] = useState<"home" | "settings" | "deploy">("home");
  /** which macro's list is open over the deploy screen, if any */
  const [picker, setPicker] = useState<"maps" | "difficulty" | null>(null);
  const [level, setLevel] = useState<LevelSpec | null>(null);
  /**
   * The difficulty macro: the rung the next run is played at. Every rung
   * is open from the first run; this is the save's remembered pick
   * (Progress.difficulty), Level 1 on a fresh save.
   */
  const [tier, setTier] = useState(0);
  /**
   * The map macro: a world id, or null for RANDOM — the default, and the
   * pick that pays RANDOM_MAP_XP_BONUS. Resolved through worldById so a
   * stale id reads as Random rather than as a world that is not there.
   */
  const [mapPick, setMapPick] = useState<string | null>(null);
  const pickedWorld = mapPick == null ? null : worldById(mapPick);
  /**
   * Was the run under way started on a map the game picked? Read when the
   * run settles (grantRunReward), which is the one moment it pays.
   */
  const [runRandom, setRunRandom] = useState(false);
  // the selector draws map previews, so the documents load with the menu —
  // Game.create re-fetches later, keeping in-game state just as fresh
  const [mapsReady, setMapsReady] = useState(false);
  // sandbox mode, hidden until Ctrl+Shift+S like the admin page's
  // Ctrl+Shift+M: widens the pace strip to every SPEEDS multiplier AND
  // lifts the stage gate and the price of every placement
  // (Game.setTech(null)), so a run can be staged for filming. Leaving it
  // drops back to whatever the save allows — a sandbox-only pace steps
  // down to the fastest speed the save owns (see the effect below)
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
   * Where the progress screen was opened FROM. A loss is the moment it is
   * most worth reading — the run just banked everything its towers killed on
   * the way down — so the defeat panel offers it, and leaving from there has
   * to come back to the run rather than dump the player on the level list.
   */
  const [techFrom, setTechFrom] = useState<"menu" | "game">("menu");
  /** the top-left panel collapsed to its wave line — a saved preference
   * (Progress.hudMinimized), initialized on mount with the rest of the save */
  const [hudMin, setHudMin] = useState(false);
  /**
   * THE RULES THIS RUN IS PLAYED UNDER, for the corner panel — the level's
   * own and the roll alike, as the deploy dialog listed them. A player who
   * skimmed the dialog and is now three waves in wants to know why the
   * swarm is doing what it is doing; this is where that answer lives on
   * the field. It folds away with the rest of the details (hudMin).
   */
  const hudRules = useMemo(
    () =>
      level
        ? mutationsInForce(level.intrinsicMutation, level.mutation)
            .map(mutationById)
            .filter((m): m is NonNullable<typeof m> => m !== null)
        : [],
    [level],
  );
  /**
   * THE ROLL FOR A PICKED MAP — as many rules as the difficulty asks for,
   * costing no more than the points it carries (both dials on the rung),
   * with the world's own rules handed to the roller as an exclusion so it
   * cannot spend the tier's points on a rule the run already plays under.
   * Level 1 carries zero of each and so rolls nothing.
   *
   * IT IS ROLLED ONCE PER (MAP, DIFFICULTY), HERE, and the deploy screen
   * shows it under the macros, so whatever is on screen when Start is
   * pressed is exactly what the run is played under (startRun carries it).
   * Re-rolling on every render would spin the list under the player's
   * eyes; rolling at Start would deploy rules that were never shown.
   *
   * A RANDOM MAP ROLLS AT START, because the exclusion is the map's and
   * the map is not known until then. That deploy is a surprise by design
   * — the bonus is paid for exactly that — and the rules in force are on
   * the HUD from the first wave (hudRules), so nothing is hidden for long.
   */
  const previewRoll = useMemo(
    () =>
      pickedWorld
        ? rollMutations(
            tierMutationPoints(tier),
            tierMutationCount(tier),
            pickedWorld.intrinsicMutation ?? [],
          )
        : [],
    [pickedWorld, tier],
  );
  /** every rule the previewed deploy is played under — the map's own and the roll */
  const previewRules = useMemo(
    () =>
      pickedWorld
        ? mutationsInForce(pickedWorld.intrinsicMutation, previewRoll)
            .map(mutationById)
            .filter((m): m is NonNullable<typeof m> => m !== null)
        : [],
    [pickedWorld, previewRoll],
  );
  /**
   * Ambient effects on? A saved preference (Progress.effects) like the
   * pace and the HUD state, because it is a fact about the DEVICE — a
   * phone that could not afford the particles last run cannot this run
   * either. Defaults to on; only an explicit false in the save is off.
   */
  const [effects, setEffects] = useState(true);
  /**
   * The build bar's loadout, PvZ-style: which turrets ride in its slots —
   * a set, not a sequence, since the bar always renders in the canonical
   * order (ORDERED_MENU). Mirrors the save (Progress.loadout) — null means
   * the save has never curated, and the bar auto-fills its slots from
   * whatever is unlocked. `loadoutOpen` is the picker floated above the bar.
   */
  const [loadout, setLoadout] = useState<readonly TowerKind[] | null>(null);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  /**
   * The HUD size — a saved preference (Progress.uiScale) like `effects`.
   * Which settings panel is up is NOT saved: settings always opens on the
   * first tab the way every other screen opens at its top.
   */
  const [uiScale, setUiScale] = useState(UI_SCALE_DEFAULT);
  const [settingsTab, setSettingsTab] = useState<"general" | "interface">("general");
  /**
   * IS THE PAUSE OVERLAY SHOWING SETTINGS? The overlay is a MENU first —
   * Resume, Settings, Abandon — and the knobs live one press behind it.
   *
   * They used to sit open on the panel, which put a UI-size stepper and an
   * effects toggle between a paused player and the Resume button they had
   * come for. Pausing is nearly always "stop for a second", not "change my
   * settings", so the common case gets the short list and the rare one gets
   * a press.
   *
   * It falls back to the menu whenever the overlay closes (below), so
   * re-opening never lands somewhere the player did not ask for.
   */
  const [pauseSettings, setPauseSettings] = useState(false);
  /** the sandbox door asked for the hairline diagnostic — see the handoff */
  const diagRef = useRef(false);

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setTier(p.difficulty ?? 0);
    setMapPick(p.map ?? null);
    setHudMin(p.hudMinimized ?? false);
    setEffects(p.effects ?? true);
    setLoadout(p.loadout ?? null);
    setUiScale(p.uiScale ?? UI_SCALE_DEFAULT);
  }, []);

  /**
   * The one place the preference becomes pixels: --ui-scale on the root,
   * which every .ui-zoom panel reads (globals.css). Set as a side effect
   * rather than inline on a wrapper so the game screen's absolutely-placed
   * panels can each opt in at their own root — one scaled wrapper around
   * all of them would scale the canvas coordinate space too.
   */
  useEffect(() => {
    document.documentElement.style.setProperty("--ui-scale", String(uiScale));
  }, [uiScale]);

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
  }, [admin, level?.tier]);

  useEffect(() => {
    let alive = true;
    // level documents overlay WORLDS in place (see levels.ts), so a script
    // edited in the admin level editor is what the menu counts and the run
    // plays. A level with no document keeps the campaign as shipped
    Promise.all([
      loadOfficialMaps(),
      loadLevelDocs(),
      loadBalanceDoc(),
    ])
      .then(() => {
        if (alive) setMapsReady(true);
      })
      .catch(() => {}); // cards fall back to text-only; the game will retry
    return () => {
      alive = false;
    };
  }, []);

  /**
   * THE SANDBOX HANDOFF (admin → game): `/?sandbox=1&world=…&tier=…&mut=…`,
   * written by the admin page's Sandbox tab and consumed here.
   *
   * It waits on `mapsReady` because a run's spec is the LEVEL DOCUMENT's
   * script, not the shipped one — deploying before the documents land
   * would quietly play the campaign as compiled rather than as authored,
   * which is the one thing a debug tool must not do silently.
   *
   * THE RULES COME FROM THE URL AND ARE NEVER ROLLED. That is the whole
   * point of the door: the campaign's mutators arrive by dice
   * (rollMutations) and cannot be asked for, so testing one meant
   * re-deploying until it turned up. `cleanMutations` still filters the
   * list — a hand-typed or stale id degrades to the rules that exist
   * rather than reaching the sim as a name it has never heard of.
   *
   * The query is STRIPPED once consumed (replaceState, no reload), so
   * abandoning the run lands on an ordinary menu and a refresh mid-run
   * does not silently re-deploy something the player has already left.
   */
  useEffect(() => {
    if (!mapsReady || typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("sandbox") !== "1") return;
    const w = worldById(q.get("world") ?? "") ?? WORLD;
    const t = Math.max(0, Math.min(RUNG_COUNT - 1, Math.floor(Number(q.get("tier")) || 0)));
    const mutation = cleanMutations((q.get("mut") ?? "").split(",").filter(Boolean));
    // `&diag=1` asks for the hairline diagnostic (Game.diagnose) once the
    // run is up. Read here, because the next line takes the query away
    diagRef.current = q.get("diag") === "1";
    window.history.replaceState(null, "", window.location.pathname);
    setMapPick(w.id);
    setTier(t);
    setRunRandom(false); // asked for by id: nothing random about it
    setAdmin(true); // a sandbox run: whole tree, no caps, every pace
    setLevel(runSpec(w, t, mutation));
    setScreen("game");
    setLoadUi({ step: firstLoadStep(), out: false });
  }, [mapsReady]);

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
        // the device's own preference, read from the save rather than
        // from state: this runs once at create, and a run started right
        // after a toggle must not come up with last render's value
        g.setEffects(save.effects ?? true);
        // the pace carries across runs and across sessions — a player who
        // plays at 4x wants 4x again after a loss, not 1x and a click
        g.setSpeed(startingSpeed(save, admin ? SPEEDS : techOf(save).speeds));
        // NO SAVED BOARD STANDS BACK UP. A board is bought in scrap now,
        // from the opening stipend outward, so every run starts on bare
        // rock — restoring last run's turrets would be handing them over
        // for nothing
        game = g;
        gameRef.current = g;
        setHud(g.ui());
        // the hairline diagnostic (Game.diagnose), a few frames in, once
        // the atlas is up and the first frames have drawn
        if (diagRef.current) timers.push(setTimeout(() => g.diagnose(), 2500));
        if (process.env.NODE_ENV !== "production") {
          const w = window as unknown as Record<string, unknown>;
          w.__mechswarm = g;
          // the ladder's number guide, next to the running game.
          // `__ladder.audit()` is one row a rung, `.waves()` one row a
          // wave, and `.spec(n)` is what to hand `sim.loadLevel` to watch a
          // rung actually play out
          w.__ladder = {
            spec: (n: number) => specForTier(WORLD, n),
            budget: (n: number) => budget(WORLD, n),
            // the number guide: audit() is one row a rung, waves() is one
            // row a wave with its share of the rung it belongs to
            audit: () => audit(WORLD),
            waves: () => waveGuide(WORLD),
            check: () => check(WORLD),
            // the three stages against their turret tiers, and the XP
            // ladder, as one printable table — the thing to read after
            // touching a price or a wave
            stages: () => stageAudit(WORLD),
            grind: () => console.log(stageTable(WORLD)),
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
        // level.id names the world the run was on; runRandom says whether
        // the game picked it, which is what the map bonus is paid for
        const reward = grantRunReward(
          level.tier ?? 0,
          Array.from(g.sim.killsByKind),
          ui.won,
          level.id,
          runRandom,
        );
        const after = loadProgress();
        setResult(reward);
        setProgress(after);
        // the run is over, so its sandbox is too — a retry from the results
        // panel starts on what the save actually owns (see `admin`)
        setAdmin(false);
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
      if (w.__mechswarm === game) delete w.__mechswarm;
    };
  }, [screen, level, runRandom]);

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

  /**
   * The turrets in the bar, ALWAYS in the canonical order (ORDERED_MENU) —
   * picking foreshadow late does not put it before ripple; it slots in
   * where the roster ranks it, last. Sandbox (barSlots null) shows the
   * whole roster. A curated save shows its picks — those still unlocked,
   * trimmed to the slot count — and an uncurated one auto-fills its slots
   * from the unlocked list. Auto-fill only runs while the save has never
   * curated: once picks are saved, a removed turret STAYS removed instead
   * of being quietly refilled.
   *
   * WITH ONE OVERRIDE: A BAR WITH NOTHING ON IT IS NOT A CURATION, IT IS A
   * BROKEN SCREEN. It cannot happen from the rung any more — every turret
   * the save owns is legal at every rung now that the per-difficulty roster
   * ceiling is gone — but a curation naming only turrets a LOCKED save no
   * longer stands up still can (switching the full unlock back off is the
   * live case). When the picks leave the bar EMPTY the save is treated as
   * uncurated here and the slots auto-fill, exactly as on a fresh save.
   *
   * ONLY the empty case. A curation that still offers something is honoured
   * as it stands, short bar and all — those are turrets the player asked
   * for, and a half-full bar is still usable.
   */
  const barKinds = (): TowerKind[] => {
    if (!hud) return [];
    // EVERY turret rides the bar. The ones the track has not handed out
    // yet are greyed with the level that opens them (the badge below), so
    // the bar is also the answer to "what is there still to earn"
    const all = ORDERED_MENU.map((t) => t.kind);
    if (hud.barSlots === null) return all;
    const picks = new Set(loadout ?? all);
    const chosen = all.filter((k) => picks.has(k));
    return (chosen.length > 0 ? chosen : all).slice(0, hud.barSlots);
  };

  /**
   * Add or remove one turret from the loadout. The first edit persists the
   * auto-filled set it started from, so what the player sees is what they
   * are editing. Removing the kind currently picked for building also drops
   * the pick — otherwise the ghost preview would keep following a button
   * that is no longer on screen. Adding past the slot count is refused; the
   * panel's count badge says why.
   */
  const toggleLoadout = (kind: TowerKind): void => {
    if (!hud || hud.barSlots === null) return;
    const cur = barKinds();
    let next: TowerKind[];
    if (cur.includes(kind)) {
      next = cur.filter((k) => k !== kind);
      const g = gameRef.current;
      if (g && hud.buildKind === kind) {
        g.setBuildKind(null);
        setHud(g.ui());
      }
    } else {
      if (cur.length >= hud.barSlots) return;
      next = [...cur, kind];
    }
    // stored in canonical order too, so the save reads exactly like the bar
    const ordered = BY_MINDUSTRY_VALUE.filter((k) => next.includes(k));
    setLoadout(ordered);
    saveLoadout(ordered);
  };

  const pickTower = (kind: TowerKind): void => {
    const g = gameRef.current;
    if (!g) return;
    const next = hud?.buildKind === kind ? null : kind;
    g.setBuildKind(next);
    setHud(g.ui());
  };

  const togglePause = (): void => {
    const g = gameRef.current;
    if (!g) return;
    g.togglePause();
    setHud(g.ui());
  };

  /**
   * THE PAUSE OVERLAY ALWAYS RE-OPENS ON ITS MENU, never on the settings a
   * previous pause left showing. It hangs off the overlay's own state
   * because Esc opens and closes it inside the sim (Game.onKeyDown) rather
   * than through openMenu below — a reset written into the button would be
   * a rule that only holds for players who use the button.
   */
  const menuOpen = hud?.menuOpen ?? false;
  useEffect(() => {
    if (!menuOpen) setPauseSettings(false);
  }, [menuOpen]);

  const openMenu = (): void => {
    const g = gameRef.current;
    if (!g) return;
    g.openMenu();
    setHud(g.ui());
  };

  const backToMenu = (): void => {
    granted.current = false;
    setResult(null);
    // SANDBOX BELONGS TO THE RUN IT WAS OPENED IN. Abandoning is one of the
    // three ways a run ends (the other two settle in the poll above), and
    // every one of them puts the next run back on what the save owns
    setAdmin(false);
    setProgress(loadProgress());
    setScreen("menu");
  };

  /**
   * Leave the progress screen. From the menu that is just the level list; from a
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
    // the run's spec is untouched — its world, its rung and the mutators
    // rolled for it when it was deployed. Nothing on the tech screen can
    // change any of the three, and a restart that re-rolled would hand a
    // player a fresh set of rules for losing under the old ones
    setScreen("game");
  };

  /**
   * START, from the macros as they stand. A picked map deploys under the
   * roll the screen has been showing; Random resolves to any map the
   * track has opened and rolls for it here. The picks are remembered
   * (saveRunPick) so the next launch opens on them.
   */
  const startRun = (): void => {
    const p = progress ?? loadProgress();
    const open = WORLDS.filter((w) => worldLock(p, w.id) == null);
    // a remembered pick the track has since closed (a wiped save) plays
    // as Random rather than as a map the save may not enter
    const picked = pickedWorld && worldLock(p, pickedWorld.id) == null ? pickedWorld : null;
    const random = picked == null;
    const w = picked ?? open[Math.floor(Math.random() * open.length)] ?? WORLD;
    const roll = random
      ? rollMutations(tierMutationPoints(tier), tierMutationCount(tier), w.intrinsicMutation ?? [])
      : previewRoll;
    saveRunPick(tier, picked?.id ?? null);
    setRunRandom(random);
    setLevel(runSpec(w, tier, roll));
    setScreen("game");
    // raised in the same batch as the screen switch, so the game screen's
    // FIRST paint is already covered - an effect would run after that
    // paint and let a frame of black canvas through
    setLoadUi({ step: firstLoadStep(), out: false });
  };

  const retry = (): void => {
    const g = gameRef.current;
    if (!g) return;
    granted.current = false;
    setResult(null);
    // the run just banked its drops — a node bought mid-overlay would not apply
    // without this re-read (tech is per-run anyway, but keep it honest)
    g.setTech(admin ? null : techOf(loadProgress()));
    // reset() clears the field and the scrap: a retry is a fresh run on
    // bare rock, exactly like the first attempt
    g.reset();
    setHud(g.ui());
  };

  /**
   * THE SETTINGS KNOBS, shared by the menu's Settings screen and the
   * in-game pause overlay — one panel, so a knob turned mid-run is the
   * same knob the menu shows, already in its new position. Every one of
   * them writes the save the moment it is touched (saveEffects,
   * saveUiScale, …), which is what makes them stick across sessions.
   *
   * `inGame` drops the two save-surgery rows (full unlock, reset): both
   * rebuild progress state under a run that is still holding the old one.
   */
  const settingsPanel = (inGame: boolean) => (
    <>
      <div
        role="tablist"
        aria-label="settings sections"
        className="ms-seg"
      >
        {(
          [
            ["general", "General"],
            ["interface", "Interface"],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            role="tab"
            aria-selected={settingsTab === tab}
            onClick={() => setSettingsTab(tab)}
            className="ms-btn px-5 py-2 text-[13px]"
          >
            {label}
          </button>
        ))}
      </div>

      {settingsTab === "interface" && (
        <div className="ms-pane flex w-full max-w-[30rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="text-[13px] font-bold uppercase tracking-widest text-[#EDEDEF]">
            UI size
          </div>
          <div
            role="group"
            aria-label="UI size"
            className="ms-seg"
          >
            {/* printed as percentages rather than named sizes: eight
                steps outrun any set of names, and "Default" on a button
                that was not the default (UI_SCALE_DEFAULT is 1) was a
                lie the old labels told */}
            {UI_SCALES.map((scale) => (
              <button
                key={scale}
                aria-pressed={uiScale === scale}
                aria-label={`UI size ${Math.round(scale * 100)}%${
                  scale === UI_SCALE_DEFAULT ? " (default)" : ""
                }`}
                onClick={() => {
                  setUiScale(scale);
                  saveUiScale(scale); // remembered across sessions
                }}
                className="ms-btn px-2.5 py-1.5 text-[13px]"
              >
                {Math.round(scale * 100)}%
              </button>
            ))}
          </div>
        </div>
      )}

      {settingsTab === "general" && (
        <>
          {/* every turret still shows its shot with effects off (see
              Sim.setEffects) — what goes is the dressing around it */}
          <div className="ms-pane flex w-full max-w-[30rem] items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-[13px] font-bold uppercase tracking-widest text-[#EDEDEF]">
                Effects
              </div>
              <div className="text-[12px] text-[#71717C]">Turn off to improve framerate</div>
            </div>
            <button
              aria-pressed={effects}
              onClick={() => {
                const next = !effects;
                setEffects(next);
                saveEffects(next); // a preference about the device
                // live: a run under way takes it on the next frame
                gameRef.current?.setEffects(next);
              }}
              className="ms-btn w-16 shrink-0 px-3 py-1.5 text-[13px]"
            >
              {effects ? "On" : "Off"}
            </button>
          </div>


          {!inGame && (
            <div className="ms-pane flex w-full max-w-[30rem] items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-bold uppercase tracking-widest text-[#EDEDEF]">
                  Reset save
                </div>
                <div className="text-[12px] text-[#71717C]">Wipes all progress — no undo</div>
              </div>
              <button
                onClick={() => {
                  if (window.confirm("Wipe all progress - resources, tech, and cleared rungs?")) {
                    resetProgress();
                    const p = loadProgress();
                    setProgress(p);
                    setTier(0);
                    setMapPick(null);
                    // the curated bar was part of the progress just
                    // wiped. Left standing it would filter the fresh
                    // save's build bar against turrets it no longer owns
                    setLoadout(null);
                  }
                }}
                className="ms-btn ms-btn-red shrink-0 px-3 py-1.5 text-[13px]"
              >
                Wipe
              </button>
            </div>
          )}
        </>
      )}
    </>
  );

  if (webglError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0b0b0d]">
        <p className="p-8 text-center text-[#A6A6AF]">{webglError}</p>
      </div>
    );
  }

  if (screen === "tech" && progress) {
    return (
      <ProgressView
        progress={progress}
        // after a battle the exit is the menu; from the menu it is the menu
        // too, one step back
        onBack={techFrom === "game" ? backToMenu : leaveTech}
        backLabel={techFrom === "game" ? "Back to menu" : "Back"}
      />
    );
  }

  if (screen !== "game" || !level) {
    /**
     * THE LEVEL AND THE WAY TO READ IT: the number, and the Progress button
     * to its right, pinned to the top-RIGHT corner — the opposite corner
     * from back, so each corner holds one thing. On the deploy screen and
     * never on the title card: a level only means anything next to the
     * run it is about to be spent on.
     */
    const bank = progress && (
      <div className="ui-zoom fixed right-[1rem] top-[1rem] z-20 flex h-11 items-center gap-3 text-[13px]">
        <LevelStrip xp={progress.xp} />
        <button
          onClick={() => {
            setTechFrom("menu");
            setScreen("tech");
          }}
          className="ms-btn ms-btn-accent px-4 py-2 text-[13px]"
        >
          Progress
        </button>
      </div>
    );
    /**
     * THE ONE BACK BUTTON: icon only, big, pinned to the top-left of the
     * viewport — the same spot on every screen that has somewhere to go
     * back to, so the thumb never hunts for it. The label survives as the
     * accessible name.
     */
    const back = (label: string) => (
      <button
        aria-label={label}
        title={label}
        onClick={() => setMenuView("home")}
        className="ui-zoom ms-btn fixed left-[1rem] top-[1rem] z-20 h-11 w-11 p-0 text-[#a2a2a2] hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M14.7 5.1 7.8 12l6.9 6.9 1.7-1.7L11.2 12l5.2-5.2z" />
        </svg>
      </button>
    );
    const randomLabel = xpBonusText(1 + RANDOM_MAP_XP_BONUS);
    return (
      // the title card is a SCREEN, not a page — nothing on it overflows,
      // so it must never bounce or scroll under a finger. The deeper menu
      // views hold lists and do scroll.
      <div
        className={`fixed inset-0 bg-[#0b0b0d] ${
          menuView === "home" ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {/* THE GROUND: a rolled world drifting under the whole front of
            house (MenuBackground). It is mounted once here rather than per
            view so walking Title → Start → a pick never re-rolls it; only
            the wash over it changes — light on the title card, darker
            under the deploy screen, which is a thing to read */}
        <MenuBackground dim={menuView === "home" ? 0.38 : 0.66} />
        {/* ui-zoom off the title card: the hero screen is composed at one
            size; the working menus scale with the UI-size knob, which is
            also what makes the knob's effect visible where it lives */}
        {/* the working views clear the corner chrome (back, the level and
            Progress) with a top pad in their own zoomed units, so a HUD
            at 200% does not stand the heading under the level strip — and
            the centring is SAFE: a column taller than the screen starts at
            the pad and scrolls, instead of spilling out of both ends */}
        <div
          className={`relative mx-auto flex min-h-full max-w-5xl flex-col items-center gap-8 py-12 pl-[1.5rem] pr-[1.5rem] [justify-content:safe_center] sm:py-16 ${
            menuView === "home" ? "" : "ui-zoom pt-20 sm:pt-20"
          }`}
        >
          {/* THE TITLE CARD. A name and two doors - nothing here describes a
              run, because no run has been chosen yet */}
          {menuView === "home" && (
            <>
              <div className="text-center">
                {/* the display face (Chakra Petch) is the techy one — the
                    body face is what makes the working UI read as terminal
                    text, and a title set in it read as more of the same.
                    The name is one word: it is the COLOUR that splits MECH
                    from SWARM, not a space or a line break. */}
                <h1 className="font-display text-5xl font-bold uppercase tracking-[0.08em] [text-shadow:0_3px_0_rgba(0,0,0,0.85),0_0_32px_rgba(0,0,0,0.9)] sm:text-6xl">
                  <span className="text-[#EDEDEF]">Mech</span>
                  <span className="text-[#FFD37F] [text-shadow:0_3px_0_rgba(0,0,0,0.85),0_0_28px_rgba(255,211,127,0.45)]">
                    Swarm
                  </span>
                </h1>
              </div>
              <div className="flex w-full max-w-[20rem] flex-col gap-3">
                <button
                  onClick={() => setMenuView("deploy")}
                  className="ms-btn ms-btn-accent w-full py-3.5 text-[15px] tracking-[0.3em]"
                >
                  Start
                </button>
                <button
                  onClick={() => setMenuView("settings")}
                  className="ms-btn w-full py-3.5 text-[15px] tracking-[0.3em]"
                >
                  Settings
                </button>
              </div>
              {/* the inspiration credit moved to Settings — the hero screen
                  carries the game's own name and nothing else's */}
              <p className="text-center text-[13px] uppercase tracking-widest text-[#a2a2a2] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                A game by Zerkka
              </p>
            </>
          )}

          {/* THE DEPLOY SCREEN. The two macros a run is chosen by, and
              Start under them. There is no map grid and no deploy dialog
              any more: a run is two picks, each one press away, and the
              defaults (Random, Level 1) are a run in themselves */}
          {menuView === "deploy" && (
            <>
              <h2 className="ms-heading text-[15px] tracking-[0.35em]">Deploy</h2>
              <div className="flex w-full max-w-[24rem] flex-col gap-3">
                {/* THE MACROS: what the next run is, as two rows that read
                    as a sentence — this map, at this level — and what
                    each pays, in the XP colour, so the trade is on the
                    screen before either list is opened */}
                <div className="flex flex-col gap-2">
                  <MacroButton
                    label="Map"
                    value={pickedWorld ? pickedWorld.name : `Random, ${randomLabel}`}
                    onClick={() => setPicker("maps")}
                  >
                    {pickedWorld ? (
                      <span className="text-[#EDEDEF]">{pickedWorld.name}</span>
                    ) : (
                      <>
                        <span className="text-[#EDEDEF]">Random</span>
                        <span className="text-[12px]" style={{ color: XP_COLOR }}>
                          {randomLabel}
                        </span>
                      </>
                    )}
                  </MacroButton>
                  <MacroButton
                    label="Difficulty"
                    value={`${rungLabel(tier)}, ${xpBonusText(tierXpBonus(tier))}`}
                    onClick={() => setPicker("difficulty")}
                  >
                    <span style={{ color: rungColor(tier) }}>{rungLabel(tier)}</span>
                    <span className="text-[12px]" style={{ color: XP_COLOR }}>
                      {xpBonusText(tierXpBonus(tier))}
                    </span>
                  </MacroButton>
                </div>
                {/* WHAT A PICKED MAP WILL BE PLAYED UNDER — the map's own
                    rules and the roll for this level, as a row of faces
                    (see MutationChip). A random map shows nothing here: its
                    roll waits for the map, and that surprise is what the
                    bonus pays for */}
                {previewRules.length > 0 && (
                  <div className="flex items-center gap-2 px-1 text-[12px]">
                    <span className="font-bold uppercase tracking-widest text-[#FF8ACB] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                      Mutators
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {previewRules.map((m, i) => (
                        <MutationChip
                          key={m.id}
                          def={m}
                          always={(pickedWorld?.intrinsicMutation ?? []).includes(m.id)}
                          fromRight={i >= previewRules.length / 2}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {/* ONE ACTION, at the bottom: this map, at this level, go */}
                <button
                  onClick={startRun}
                  className="ms-btn ms-btn-accent mt-2 w-full py-3.5 text-[15px] tracking-[0.3em]"
                >
                  Start
                </button>
              </div>
            </>
          )}

          {/* SETTINGS - everything that changes the save rather than the run.
              Wiping is the only one so far, and it lives here rather than
              beside the deploy button where a mis-tap would be costly */}
          {menuView === "settings" && (
            <>
              <h2 className="ms-heading text-[15px] tracking-[0.35em]">Settings</h2>

              {settingsPanel(false)}
              {/* the inspiration credit lives here rather than on the title
                  card — the hero screen carries the game's own name only */}
              <p className="text-[12px] uppercase tracking-widest text-[#71717C]">
                Inspired by{" "}
                <a
                  href="https://mindustrygame.github.io/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#A6A6AF] underline decoration-[#4A4A55] underline-offset-2 hover:text-[#EDEDEF]"
                >
                  Mindustry
                </a>
              </p>
            </>
          )}
        </div>

        {/* THE CORNER CHROME — back on the left, the level and Progress on
            the right — lives OUTSIDE the zoom wrapper, like the dialogs
            below: each carries its own ui-zoom, and a zoomed element inside
            a zoomed ancestor is zoomed twice (CSS zoom compounds), which
            at 200% drew a back button four times its size */}
        {menuView === "deploy" && bank}
        {menuView === "deploy" && back("Title")}
        {menuView === "settings" && back("Back")}

        {/* THE LISTS, as dialogs over the deploy screen (see PickerDialog
            for why they sit outside the zoom wrapper). A pick closes the
            list and is remembered at once, so a player who picks and then
            quits comes back to what they picked */}
        {picker === "maps" && progress && (
          <MapPicker
            progress={progress}
            pick={mapPick}
            mapsReady={mapsReady}
            onClose={() => setPicker(null)}
            onPick={(id) => {
              setMapPick(id);
              saveRunPick(tier, id);
              setPicker(null);
            }}
          />
        )}
        {picker === "difficulty" && (
          <DifficultyPicker
            tier={tier}
            onClose={() => setPicker(null)}
            onPick={(t) => {
              setTier(t);
              saveRunPick(t, pickedWorld?.id ?? null);
              setPicker(null);
            }}
          />
        )}
      </div>
    );
  }

  // how much is on the field right now, as one number — the HUD's enemy
  // count. byKind is the per-kind census the sim keeps anyway; the panel
  // only ever wants the total (see the count in the wave panel below).
  const alive = hud ? hud.byKind.reduce((a, b) => a + b, 0) : 0;

  return (
    // select-none keeps a press-and-drag across the field from turning into
    // a text selection
    <div className="fixed inset-0 overflow-hidden bg-black select-none">
      <div className="relative h-full w-full">
        <canvas
          ref={glRef}
          width={2560}
          height={1440}
          className="block h-full w-full"
        />
        <canvas
          ref={uiRef}
          width={2560}
          height={1440}
          className={`absolute inset-0 h-full w-full ${
            hud?.buildKind ? "cursor-crosshair" : "cursor-default"
          }`}
        />
        {loadUi && <LoadingScreen step={loadUi.step} out={loadUi.out} />}
        {hud?.paused && (
          // on a phone the wave panel already fills the top of the screen, so
          // the badge drops onto the map rather than landing on top of it
          <div className="ms-pane absolute left-1/2 top-[30%] -translate-x-1/2 border-[#FFD37F] px-4 py-1.5 font-display text-base font-bold uppercase tracking-[0.3em] text-[#FFD37F] sm:top-[1rem]">
            Paused
          </div>
        )}
        {/* one thin bar per boss on the field, stacked top-centre and keyed
            by spawn id so a bar never trades places with its neighbour.
            pointer-events-none: it is a readout, never a control */}
        {hud && hud.bosses.length > 0 && (
          <div className="ui-zoom pointer-events-none absolute left-1/2 top-[0.75rem] z-10 flex w-[min(40vw,22rem)] -translate-x-1/2 flex-col gap-1.5">
            {hud.bosses.map((b) => (
              <div key={b.id}>
                <div className="mb-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-[#F25555] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
                  {b.kind}
                </div>
                <div className="ms-bar w-full">
                  <div
                    className="bg-[#e55454] transition-[width] duration-150 ease-linear"
                    style={{ width: `${Math.max(0, Math.min(100, (100 * b.hp) / b.max))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {/* one fixed width for the whole top-left stack, so the panel does
            not breathe in and out as counters change and the pace strip
            lines up under it. Everything inside wraps rather than widening
            it */}
        {hud && (
          <div className="ui-zoom absolute left-[1rem] top-[1rem] flex w-80 max-w-[calc(100vw-8rem)] flex-col items-stretch gap-2">
            <div className="ms-pane w-full px-3 py-1.5">
              {/* the wave counter is what a run is read off, so the line
                  carries that and the rung and nothing else — the level
                  name is on the card that launched it. Minimized, this line
                  IS the panel: neither the next-wave countdown nor the
                  lives pool survives */}
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] uppercase tracking-widest text-[#EDEDEF] break-words">
                  <div>
                    <span className="font-bold" style={{ color: rungColor(hud.tier) }}>
                      {rungLabel(hud.tier)}
                    </span>{" "}
                    — Wave <span className="font-bold text-[#EDEDEF]">{hud.currentWave}</span>
                    {hud.mission.kind === "survive" ? (
                      // THE CLOCK IS THE MISSION on a survive map: the wave
                      // count keeps climbing past the script, so the
                      // denominator is time, not waves
                      <>
                        {" "}
                        · <span className="font-bold text-[#7FC4FF]">{clock(hud.timeLeft)}</span>{" "}
                        left
                      </>
                    ) : (
                      <> / {hud.totalWaves}</>
                    )}
                  </div>
                  {/* THE BASE'S HEALTH, on its OWN line and only where
                      there is any to report.
                      A stock base has one point: the first leak is the loss,
                      and a "1 / 1" that never moves until the run is over is
                      a number nobody needs. A plated base is a pool the
                      player is SPENDING — but minimizing is a request for
                      the BOARD, and a panel that shrinks to two lines
                      instead of one has not honoured it. So lives fold away
                      with the rest and the minimized panel is the wave line
                      alone. */}
                  {/* ...and the enemy count shares that line, in the same
                      voice. ONE NUMBER, NOT A ROSTER: the per-kind icon row
                      said what was on the field down to the last crawler,
                      which is a census nobody reads mid-wave. What a player
                      wants off this corner is "how much is still coming at
                      me", so that is all it says */}
                  {!hudMin && (
                    <div className="text-[#71717C]">
                      Lives{" "}
                      <span
                        className="font-bold"
                        style={{
                          color:
                            hud.lives > hud.livesMax / 2
                              ? "#7BE58A"
                              : hud.lives > hud.livesMax / 5
                                ? "#FFD37F"
                                : "#FF5A5A",
                        }}
                      >
                        {hud.lives}
                      </span>{" "}
                      / {hud.livesMax}
                      {alive > 0 && <span className="mx-2">·</span>}
                      {alive > 0 && (
                        <>
                          <span className="font-bold text-[#EDEDEF]">{alive}</span> enemies
                        </>
                      )}
                    </div>
                  )}
                </div>
                <button
                  title={hudMin ? "Show run details" : "Hide run details"}
                  aria-label={hudMin ? "Show run details" : "Hide run details"}
                  aria-expanded={!hudMin}
                  onClick={() => {
                    const next = !hudMin;
                    setHudMin(next);
                    saveHudMinimized(next); // a preference, kept across runs
                  }}
                  className="ms-btn ms-btn-ghost shrink-0 px-1 py-0 text-[13px] leading-5"
                >
                  <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                    {hudMin ? <path d="M6 3l4.5 5h-9z" /> : <path d="M6 9L1.5 4h9z" />}
                  </svg>
                </button>
              </div>
              {!hudMin && (
                <>
                  {/* THE RULES IN FORCE, as the deploy dialog's chips at a
                      third the size — face and band border, name and rule on
                      hover. No hover card machinery: this corner is glanced
                      at, not studied, and the codex is a tap away */}
                  {hudRules.length > 0 && (
                    <div
                      className="mb-1.5 flex flex-wrap items-center gap-1"
                      role="list"
                      aria-label="rules in force"
                    >
                      {hudRules.map((def) => {
                        const band = bandFor(def);
                        return (
                          <span
                            key={def.id}
                            role="listitem"
                            title={`${def.name} — ${def.blurb}`}
                            aria-label={`${def.name}: ${def.blurb}`}
                            className="flex h-5 w-5 items-center justify-center border bg-[#0b0b0d]"
                            style={{ borderColor: band.color }}
                          >
                            <MutationFace id={def.id} size="h-3.5 w-3.5" />
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {/* THE RUN'S MONEY, in the biggest type on the panel: it
                      is the number every build decision is made against.
                      Sandbox and the editors build free, so they show
                      nothing here. The XP the run is earning is NOT here —
                      it is the results screen's news, not the field's */}
                  {hud.scrap !== null && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                      <ScrapAmount amount={hud.scrap} size="md" className="text-xl" />
                    </div>
                  )}
                  {/* the countdown, conditional on there being a wave still
                      pending — with the script drained there is nothing left
                      to announce. The gap is not skippable: the pace strip
                      below is how a player fast-forwards through it, so the
                      wait is always paid in real ticks and the drops economy
                      cannot be cheated by releasing waves early */}
                  <div className="flex flex-wrap items-center gap-2 text-[13px] uppercase tracking-widest text-[#EDEDEF]">
                    {hud.nextWaveIn > 0 && (
                      <span>
                        Next wave{" "}
                        <span className="font-bold text-[#EDEDEF]">
                          {Math.ceil(hud.nextWaveIn)}
                        </span>
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
            {!hud.lost && !hud.won && !hud.menuOpen && (
              /* pace controls, for everyone: an idle game where the only way
                 to sit out a wave gap is to watch it is a game that wastes
                 the player's time. Pause leads, since it is the one that
                 stops the clock; the multipliers run out from it. They live
                 directly under the wave panel so the whole run reads off one
                 corner — and self-start keeps the strip its own width
                 rather than the stack's.
                 Pause and the game menu are also the two controls a
                 touchscreen has no key for, so having them on screen is what
                 makes space and esc optional rather than required */
              <div
                role="group"
                aria-label="speed controls"
                className="ms-seg self-start"
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
                  className="ms-btn px-3 py-1.5"
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
                    className="ms-btn px-3 py-1.5 text-[13px]"
                  >
                    {mult}x
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {hud && !hud.lost && !hud.won && !hud.menuOpen && (
          <div
            role="group"
            aria-label="view and menu"
            className="ui-zoom absolute right-[1rem] top-[1rem] flex items-start gap-2"
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
              className="ms-btn px-3 py-1.5 text-[13px]"
            >
              Spawns &amp; routes
            </button>
            {/* the same menu esc raises — a pointer needs a way in too */}
            <button
              aria-label="Game menu"
              title="Game menu (Esc)"
              onClick={openMenu}
              className="ms-btn p-[6px]"
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
        {/* The bar scrolls sideways instead of wrapping: a full loadout
            plus the tools does not fit across a phone (sandbox shows the
            whole roster), and a second row would eat the field. The
            scroller itself is click-through so the map keeps the space to
            either side of the buttons. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[1rem] overflow-x-auto pb-1 pl-[1rem] pr-[1rem]">
          <div
            role="group"
            aria-label="tower menu"
            className="ui-zoom pointer-events-auto mx-auto flex w-max gap-2"
          >
            {/* the loadout, in the canonical roster order: the turrets this
                save PICKED to ride the bar (see barKinds), not everything it
                owns — owning is the tech tree's business, the bar is a PvZ
                seed row. A null unlocked list is sandbox mode: the roster */}
            {barKinds().map((kind) => {
              const t = MENU_BY_KIND.get(kind)!;
              // what the badge says is the PRICE, in scrap — the number a
              // build decision is made against — and it reddens the moment
              // the run cannot cover it. Free builds (sandbox, the editors)
              // carry no number at all
              const price = hud?.scrap === null || !hud ? null : hud.prices[t.kind];
              const poor = price !== null && hud !== null && hud.scrap !== null && hud.scrap < price;
              // the track (track.ts): a turret the save has not reached yet
              // rides the bar shut, and the badge says which level opens it.
              // A null roster is sandbox mode, where nothing is shut
              const opens = turretUnlockLevel(t.kind);
              const locked = hud !== null && hud.unlocked !== null && !hud.unlocked.includes(t.kind);
              const label =
                locked
                  ? `${t.name} — unlocks at level ${opens}`
                  : price === null
                    ? t.name
                    : `${t.name} — ${price} scrap`;
              return (
                <button
                  key={t.kind}
                  title={label}
                  aria-label={label}
                  aria-pressed={hud?.buildKind === t.kind}
                  aria-disabled={locked}
                  onClick={() => pickTower(t.kind)}
                  className={`${TOOL_BTN} ${locked ? "opacity-40" : poor ? "opacity-60" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
                  <img
                    src={icons[t.kind] ?? t.icon}
                    alt=""
                    className="h-10 w-10 [image-rendering:pixelated]"
                  />
                  {price !== null && (
                    <span
                      className={`text-[13px] font-bold leading-none ${
                        locked ? "text-[#a2a2a2]" : poor ? "text-[#FF8A8A]" : "text-white"
                      }`}
                    >
                      {locked ? `L${opens}` : price}
                    </span>
                  )}
                </button>
              );
            })}
            {/* the loadout editor's door. Always on the bar in campaign —
                the SLOTS are the base rule, only their count is sold on the
                tech tree — and absent in sandbox, where the whole roster
                shows and there is nothing to curate */}
            {hud && hud.barSlots !== null && (
              <button
                title="Edit loadout — pick which turrets ride the bar"
                aria-label="Edit loadout"
                aria-pressed={loadoutOpen}
                aria-expanded={loadoutOpen}
                onClick={() => setLoadoutOpen((v) => !v)}
                className={`${TOOL_BTN} ${loadoutOpen ? "" : "text-[#a2a2a2]"}`}
              >
                <svg viewBox="0 0 24 24" className="h-8 w-8 fill-current" aria-hidden="true">
                  <path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" />
                </svg>
                <span className="text-[11px] font-bold uppercase leading-none tracking-widest">
                  Slots
                </span>
              </button>
            )}
          </div>
        </div>
        {/* the loadout picker, floated above the bar it fills: every
            unlocked turret, lit = riding a slot. With the bar full the
            rest dim out until something is removed — and the count badge
            is the one number that explains both states */}
        {hud && hud.barSlots !== null && loadoutOpen && (
          <div className="ui-zoom ms-pane absolute bottom-[6.25rem] left-1/2 z-10 max-w-[calc(100vw-2rem)] -translate-x-1/2 p-3">
            {(() => {
              const bar = barKinds();
              const full = bar.length >= (hud.barSlots ?? 0);
              return (
                <>
                  <div className="mb-2 flex items-baseline justify-center gap-2 text-[11px] uppercase tracking-widest">
                    <span className="text-[#71717C]">Loadout</span>
                    <span className={`font-bold ${full ? "text-[#FFD37F]" : "text-[#EDEDEF]"}`}>
                      {bar.length}/{hud.barSlots}
                    </span>
                  </div>
                  <div
                    role="group"
                    aria-label="loadout picker"
                    className="flex max-w-[26rem] flex-wrap justify-center gap-2"
                  >
                    {ORDERED_MENU.filter(
                      (t) => !hud.unlocked || hud.unlocked.includes(t.kind),
                    ).map((t) => {
                      const inBar = bar.includes(t.kind);
                      return (
                        <button
                          key={t.kind}
                          title={
                            inBar
                              ? `Remove ${t.name} from the bar`
                              : full
                                ? "Bar is full — remove a turret first"
                                : `Add ${t.name} to the bar`
                          }
                          aria-pressed={inBar}
                          aria-disabled={!inBar && full}
                          onClick={() => toggleLoadout(t.kind)}
                          className={`ms-btn h-12 w-12 p-0 ${
                            inBar ? "" : full ? "opacity-30" : "opacity-50 hover:opacity-90"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite */}
                          <img
                            src={icons[t.kind] ?? t.icon}
                            alt={t.name}
                            className="h-9 w-9 [image-rendering:pixelated]"
                          />
                        </button>
                      );
                    })}
                  </div>
                  {/* a full bar that could still grow points at the fix */}
                  {full && (hud.barSlots ?? 0) < 8 && (
                    <div className="mt-2 text-center text-[11px] uppercase tracking-widest text-[#71717C]">
                      More slots are sold on the tech tree
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
        {hud?.lost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="ui-zoom ms-pane-solid w-80 max-w-[calc(100vw-2rem)] border-[#6b2a2a] p-6 text-center">
              <div className="font-display text-xl font-bold uppercase tracking-widest text-[#e55454]">
                Out of lives
              </div>
              <div className="mt-4 space-y-1 text-base text-[#EDEDEF]">
                <div>
                  Reached wave{" "}
                  <span className="font-bold text-[#EDEDEF]">{hud.currentWave}</span>
                  {hud.mission.kind === "survive" ? (
                    <>
                      {" "}
                      with <span className="font-bold text-[#EDEDEF]">{clock(hud.timeLeft)}</span>{" "}
                      left
                    </>
                  ) : (
                    <> of {hud.totalWaves}</>
                  )}
                </div>
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {result && result.xp > 0 && (
                  <div className="space-y-1 pt-1">
                    {/* kills are the income, so a loss still pays for
                        everything the towers killed on the way down —
                        which is what makes a failed push into progress */}
                    <div>Earned (×{result.xpBonus.toFixed(2)})</div>
                    <XpAmount amount={result.xp} className="justify-center" />
                    <RandomMapLine result={result} />
                    <LevelUpLine result={result} />
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
                  className="ms-btn ms-btn-accent w-full px-5 py-2 text-base"
                >
                  Progress
                </button>
                <div className="flex justify-center gap-3">
                <button
                  onClick={retry}
                  className="ms-btn px-5 py-2 text-base"
                >
                  Retry
                </button>
                <button
                  onClick={backToMenu}
                  className="ms-btn px-5 py-2 text-base"
                >
                  Menu
                </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {hud?.won && !hud.lost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="ui-zoom ms-pane-solid w-80 max-w-[calc(100vw-2rem)] border-[#2f5a3a] p-6 text-center">
              <div className="font-display text-xl font-bold uppercase tracking-widest text-[#7BE58A]">
                {hud.mission.kind === "survive" ? "Survived" : "Line held"}
              </div>
              <div className="mt-1 text-[12px] uppercase tracking-widest text-[#71717C]">
                <span style={{ color: rungColor(hud.tier) }}>{rungLabel(hud.tier)}</span> ·{" "}
                {missionText(level).title}
              </div>
              <div className="mt-4 space-y-1.5 text-base text-[#EDEDEF]">
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {result && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-2 border-[#454545] pt-1.5">
                      <span className="font-bold text-[#EDEDEF]">
                        Earned
                        <span className="ml-1 font-normal text-[#EDEDEF]">
                          ×{result.xpBonus.toFixed(2)}
                        </span>
                      </span>
                      <XpAmount amount={result.xp} />
                    </div>
                    <RandomMapLine result={result} />
                    <LevelUpLine result={result} />
                  </>
                )}
              </div>
              <div className="mt-6 flex justify-center">
                <button
                  onClick={backToMenu}
                  className="ms-btn ms-btn-green px-6 py-2 text-base"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}
        {/* THE PAUSE SHEET. Opening it holds the sim (Game.openMenu), so
            its heading says what the run is doing — and it carries the
            same settings panel the menu shows, because the moment a phone
            needs the effects switch is mid-run, when the framerate dips */}
        {hud?.menuOpen && !hud.lost && !hud.won && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="ui-zoom ms-pane flex max-h-[calc(100vh-2rem)] w-[30rem] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 overflow-y-auto p-6">
              {/* the sandbox door is Ctrl+Shift+S; the row below says when
                  it is open, and is also what closes it */}
              <h2 className="font-display text-xl font-bold uppercase tracking-[0.3em] text-[#FFD37F]">
                Paused
              </h2>
              {admin && !pauseSettings && (
                <div className="ms-pane flex w-full max-w-[20rem] items-center justify-between gap-3 border-[#6b4f8a] px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold uppercase tracking-widest text-[#C9A7FF]">
                      Sandbox
                    </div>
                    <div className="text-[12px] text-[#71717C]">
                      Every turret and pace — this run only
                    </div>
                  </div>
                  <button
                    onClick={() => setAdmin(false)}
                    className="ms-btn ms-btn-tint shrink-0 px-3 py-1.5 text-[13px]"
                    style={{ "--ms-tint": "#c9a7ff" } as CSSProperties}
                  >
                    Off
                  </button>
                </div>
              )}
              {/* THE MENU, or the settings it hides. One press deep, and the
                  press back out is the same button in the same place */}
              {pauseSettings ? (
                <>
                  {settingsPanel(true)}
                  <button
                    onClick={() => setPauseSettings(false)}
                    className="ms-btn w-full max-w-[20rem] px-5 py-2 text-base"
                  >
                    Back
                  </button>
                </>
              ) : (
                <div className="flex w-full max-w-[20rem] flex-col gap-2">
                  <button
                    onClick={() => {
                      const g = gameRef.current;
                      if (!g) return;
                      g.closeMenu();
                      setHud(g.ui());
                    }}
                    className="ms-btn ms-btn-accent w-full px-5 py-2 text-base"
                  >
                    Resume
                  </button>
                  <button
                    onClick={() => setPauseSettings(true)}
                    className="ms-btn w-full px-5 py-2 text-base"
                  >
                    Settings
                  </button>
                  {/* the one thing here that cannot be undone sits last and
                      alone, in the colour nothing else on the panel wears */}
                  <button
                    onClick={backToMenu}
                    className="ms-btn ms-btn-red w-full px-5 py-2 text-base"
                  >
                    Abandon run
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
