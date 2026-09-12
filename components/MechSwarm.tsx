"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { ADMIN_ENABLED } from "@/game/env";
import {
  BOOT_STEP_LABEL,
  BOOT_STEPS,
  firstLoadStep,
  Game,
  LOAD_STEP_LABEL,
  LOAD_STEPS,
  SPEEDS,
  type BootStep,
  type LoadStep,
  type UiState,
} from "@/game/game";
import { loadBalanceDoc } from "@/game/balance";
import {
  FAMILIES,
  FAMILY_ACCENT,
  familyByKey,
  loadLevelDocs,
  missionText,
  rollFamilies,
  transformScript,
  waveGroups,
  WORLD,
  worldById,
  WORLDS,
  type FamilyKey,
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
  tierCountScale,
  tierLevel,
  tierMutationCount,
  tierMutationPoints,
  tierMutationStep,
  tierXpBonus,
} from "@/game/ladder";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import {
  bestClearOn,
  effectiveLevel,
  grantRunReward,
  loadProgress,
  resetProgress,
  saveEffects,
  saveUiScale,
  savePanSpeed,
  saveAllyBars,
  saveEnemyBars,
  saveStatusMarks,
  HEALTH_BAR_MODES,
  HEALTH_BARS_DEFAULT,
  type HealthBarMode,
  STATUS_MODES,
  STATUS_MARKS_DEFAULT,
  type StatusMode,
  PAN_SPEED_DEFAULT,
  PAN_SPEEDS,
  UI_SCALE_DEFAULT,
  UI_SCALES,
  saveRunPick,
  saveSpeed,
  startingSpeed,
  techOf,
  worldLock,
  type Progress,
  type RunReward,
} from "@/game/progress";
import { atlasReady, buildAtlas, turretIcon, unitIcon } from "@/game/atlas";
import {
  cleanMutations,
  mutationById,
  mutationsInForce,
  rollMutations,
  type MutationDef,
  type MutationId,
} from "@/game/mutation";
import {
  canQuit,
  displayControls,
  quitGame,
  type DisplayMode,
  type DisplayState,
} from "@/game/storage";
import { BUILD } from "@/game/version";
import { BUILD_COLS, BUILD_SLOTS, slotForCode, type BuildSlot } from "@/game/tech";
import {
  difficultyOpen,
  lockedMutators,
  MUTATORS_FROM,
  rewardsAt,
  rewardText,
} from "@/game/track";
import { TOWER_DESC, TOWERS } from "@/game/constants";
import { TOWER_ICONS } from "@/game/towerIcons";
import { TOWER_KINDS } from "@/game/types";
import { levelProgress, POINT_COLOR, XP_COLOR } from "@/game/economy";
import { itemCount, LevelStrip, ScrapAmount, XpAmount } from "./Items";
import ProgressView from "./Progress";
import { bandFor, MutationFace } from "./mutationFace";
import { tile } from "./tile";
import { HoverCard, useHoverCard } from "./HoverCard";
import MenuBackground from "./MenuBackground";
import { useEscapeBack } from "./Board";
import { DealCorner, useDeal } from "./Deal";
import { Inspector } from "./Inspector";
import { RelicShelf } from "./Relics";
import { useConfirm } from "./ConfirmDialog";

/** the level card's map preview — the admin editor's thumbnail look */
function LevelThumb({ mapId, bare = false }: { mapId: string; bare?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const m = loadMap(mapId);
    if (m && ref.current) drawThumb(m, ref.current);
  }, [mapId]);
  // fixed-aspect frame: every campaign map is square (Mindustry's own
  // 256x256, see scripts/maps/mindustry.mjs), so the frame is square too;
  // a reference document of another shape sits centred inside it rather
  // than setting its own height and leaving the cards ragged.
  // `bare` drops the frame's own border and fill: on the menu the thumb is
  // already inside the card's border, and the second box around it read as
  // a picture of a map rather than as the map
  return (
    <div
      className={`flex aspect-square items-center justify-center overflow-hidden${
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

/**
 * The longest the boot screen will wait on the menu's battlefield before
 * showing the menu anyway. Nothing should ever reach it — a cold page is a
 * second or two of packing and carving — but a screen that says LOADING
 * forever is the worst thing this can do, and there are ways to get one
 * that are nobody's fault: a driver that will not give up a WebGL2 context,
 * a frame callback a browser declines to run. Past this the player gets the
 * title card with the ground still arriving under it, which is exactly what
 * they used to get every launch.
 */
const BOOT_MAX_MS = 30000;

/** the loading screen's own state: which step, and whether it is dissolving */
interface LoadUi {
  step: LoadStep;
  out: boolean;
}

/**
 * THE LOADING SCREEN, worn by both the waits worth showing: the page's own
 * boot (`boot`, the sheet and the documents and the menu's battlefield) and
 * a level start (`loadUi`). One screen for both, because they are the same
 * promise to the player — something is being prepared, this is how far it
 * has got — and two would only differ in the wrong ways.
 *
 * `cover` is the only thing that changes between them: the boot is over the
 * whole page and everything on it, a level start is over the game screen's
 * canvases inside their own stacking context.
 */
function LoadingScreen({
  label,
  fill,
  out,
  cover = "absolute z-20",
}: {
  /** what is happening, in words */
  label: string;
  /** how far along, 0–1 */
  fill: number;
  out: boolean;
  cover?: string;
}) {
  // NOTHING ABOUT THE RUN. No map, no tier, no wave count: what is coming is
  // the run's own answer to give, wave by wave, and a preview printed before
  // the first enemy lands is something the player can do nothing with. The
  // screen says it is loading and shows how far along it is, and stops there

  // steps, not bytes: nothing here streams, so the bar fills a stage at a
  // time rather than pretending to a percentage it cannot know
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`${cover} inset-0 flex items-center justify-center bg-[#0b0b0d] transition-opacity duration-[260ms] ${
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
              style={{ width: `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%` }}
            />
          </div>
          <p className="text-center text-[15px] uppercase tracking-widest text-[#71717C]">
            {label}
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


/*
 * THE MAP BONUS LINE IS GONE from the results panel, with the bonus it
 * named (economy.ts). A line saying "Random map x1.00" is a line about
 * nothing.
 */

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
    <div className="pt-1 text-[14px] uppercase tracking-widest text-[#A6A6AF]">
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
 * picked rung, re-cast into the families the deploy rolled
 * (transformScript), plus the mutators rolled for it (mutation.ts).
 *
 * The three are joined HERE and not in specForTier, because they answer
 * different questions and the audit arithmetic only wants the first: a
 * rung is how much the campaign sends, the families are who it sends,
 * and a mutator is what happens to them on the way in. The rung's count
 * is scaled before the re-cast, so the body count the picker promised is
 * the body count that walks in whichever families took the slots.
 */
const runSpec = (
  world: LevelSpec,
  tier: number,
  mutation: readonly MutationId[],
): LevelSpec => {
  const spec = specForTier(world, tier);
  // THE DIE IS ROLLED HERE, against the script it is about to be dealt
  // into, because the roll is not free of it: a flying family may not take
  // a slot the OPENING WAVE sends (levels.ts rollFamilies), and which
  // slots those are is a property of this tier's expanded script. Rolling
  // outside and passing the result in let a caller hand over a deal that
  // opens wave 1 with flares, which is an opening with one legal answer.
  const families = rollFamilies(Math.random, spec.script);
  return {
    ...spec,
    script: transformScript(spec.script, families),
    families,
    ...(mutation.length > 0 ? { mutation } : null),
  };
};


/**
 * A MACRO — one of the two dials on the start screen, printed as a row:
 * what it is on the left, what it is set to on the right, and the whole
 * row a button that opens the list to change it. The value is what a
 * player reads at a glance ("Random · +25% XP", "Scourge · 80% XP"), so
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
      <span className="text-[13px] text-[#a2a2a2]">{label}</span>
      <span className="flex items-center gap-2 whitespace-nowrap text-[16px] tracking-[0.12em]">
        {children}
        <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current text-[#71717C]" aria-hidden="true">
          <path d="M9.3 5.1 16.2 12l-6.9 6.9-1.7-1.7L12.8 12 7.6 6.8z" />
        </svg>
      </span>
    </button>
  );
}

/**
 * THE LIST BEHIND A MACRO: a panel over the start screen in TWO PANES —
 * a narrow list of choices on the left, one line each, the one under the
 * cursor marked; and on the right what that choice is, in words and (for
 * a map) a picture, with the one button that takes it. A row click only
 * moves the cursor, so a player can read every choice before committing;
 * the Select button on the right is the pick. It closes on Select, on
 * Escape and on a click outside — every way a dialog anyone has met
 * closes.
 *
 * It sits OUTSIDE the menu's zoom wrapper on purpose: `ui-zoom` is a CSS
 * `zoom`, and a fixed backdrop inside one covers the scaled box rather
 * than the viewport. The panel carries its own ui-zoom, so the UI-size
 * knob still moves it.
 */
function PickerDialog({
  title,
  onClose,
  list,
  detail,
}: {
  title: string;
  onClose: () => void;
  /** the rows, left */
  list: ReactNode;
  /** what the cursor is on, right */
  detail: ReactNode;
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
      className="ms-screen fixed inset-0 z-30 flex items-center justify-center p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="ui-zoom ms-pane-solid flex max-h-[calc(100vh-2rem)] w-full max-w-[38rem] flex-col p-4"
      >
        <h2 className="ms-heading ms-strip -mx-4 -mt-4 mb-3 text-[14px]">{title}</h2>
        <div className="flex min-h-0 gap-3">
          <div role="listbox" className="flex w-[12rem] shrink-0 flex-col gap-1.5 overflow-y-auto">
            {list}
          </div>
          <div className="ms-pane-solid flex min-h-[16rem] min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {detail}
          </div>
        </div>
      </div>
    </div>
  );
}

/** the one button on a detail pane: take what the cursor is on */
function SelectButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ms-btn ms-btn-accent mt-auto w-full py-2.5 text-[15px]"
    >
      Select
    </button>
  );
}

/** a label and its value on a detail pane, one line */
function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <span className="shrink-0 uppercase tracking-widest text-[#71717C]">{label}</span>
      <span className="text-right text-[#EDEDEF]">{children}</span>
    </div>
  );
}

/**
 * One choice in a picker: a bordered row, one line. `focused` is the row
 * the detail pane is showing (a solid gold border); `selected` is what the
 * run is actually set to (a gold dot at the left), which may be a
 * different row while the player is reading.
 */
function PickRow({
  selected,
  focused,
  onPick,
  children,
}: {
  selected: boolean;
  focused: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      role="option"
      aria-selected={focused}
      aria-current={selected ? "true" : undefined}
      onClick={onPick}
      className={`ms-pane-solid flex w-full items-center gap-2 px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD37F] ${
        focused ? "border-[#FFD37F]" : "hover:border-[#A6A6AF]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${selected ? "bg-[#FFD37F]" : "bg-transparent"}`}
      />
      {children}
    </button>
  );
}

/** a bonus as the extra it pays on top: x1.25 prints as "+25% XP" — the random map's line */
const xpBonusText = (mult: number): string => {
  const pct = Math.round((mult - 1) * 100);
  return pct > 0 ? `+${pct}% XP` : "Base XP";
};

/**
 * THE HARDEST DIFFICULTY THAT ROLLS NO RULES — Nemesis, the whole script
 * at full count. It is the ceiling for a save below the mutator phase,
 * and where a stored pick that has become unplayable lands (see the
 * clamp below): a save whose difficulty was set on the dev door and then
 * reset must not sit pointing at a run it cannot deploy.
 */
const TOP_RULELESS_TIER = Math.max(
  0,
  ...Array.from({ length: RUNG_COUNT }, (_, t) => t).filter((t) => tierMutationCount(t) === 0),
);

/** a rung's multiplier as its share of the mission pot: Incursion prints
 *  "40% XP", Nemesis — the rung the pot is priced for — "100% XP", the
 *  top rung "220% XP" */
const xpShareText = (mult: number): string => `${Math.round(mult * 100)}% XP`;

/**
 * THE MAP LIST. Random leads and is the default: the game picks any open
 * map on Start. It used to pay a quarter more XP for the trust and does
 * not any more — it is the default because it is the best way to play the
 * campaign, not because it is bribed. Under it, every world by name, one
 * line each — a locked one is on the list, never hidden, greyed. THE PICTURE IS ON THE RIGHT AND ONLY AFTER A CLICK: the
 * list is names, the cursor starts on Random, and a row click puts that
 * map's thumbnail, mission and standing (what opens it, or the best
 * difficulty beaten on it) beside it. No map is ranked against another: every map is as hard as the
 * difficulty it is played at, and the difficulty is the other macro.
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
  // the row under the cursor: null is Random, which is where it starts —
  // so the right pane is on screen from the first frame (a map's picture
  // only appears once its row is clicked)
  const [focus, setFocus] = useState<string | null | undefined>(null);
  const world = focus == null ? null : worldById(focus);
  const lock = world ? worldLock(progress, world.id) : null;
  const best = world ? bestClearOn(progress, world.id) : 0;

  const rowText = "truncate font-display text-[15px] font-bold uppercase tracking-widest";
  const list = (
    <>
      <PickRow selected={pick == null} focused={focus === null} onPick={() => setFocus(null)}>
        <span className={`${rowText} text-[#EDEDEF]`}>Random</span>
      </PickRow>
      {WORLDS.map((w) => {
        const locked = worldLock(progress, w.id) != null;
        return (
          <PickRow
            key={w.id}
            selected={pick === w.id}
            focused={focus === w.id}
            onPick={() => setFocus(w.id)}
          >
            <span className={`${rowText} ${locked ? "text-[#71717C]" : "text-[#EDEDEF]"}`}>
              {w.name}
            </span>
          </PickRow>
        );
      })}
    </>
  );

  let detail: ReactNode;
  if (focus === undefined) {
    detail = (
      <p className="m-auto text-center text-[14px] uppercase tracking-widest text-[#71717C]">
        Pick a map to see it
      </p>
    );
  } else if (world == null) {
    detail = (
      <>
        <div className="flex aspect-square w-full items-center justify-center bg-[#0b0b0d] text-[#FFD37F]">
          <svg viewBox="0 0 24 24" className="h-12 w-12" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="8" cy="8" r="1.7" fill="currentColor" />
            <circle cx="16" cy="8" r="1.7" fill="currentColor" />
            <circle cx="12" cy="12" r="1.7" fill="currentColor" />
            <circle cx="8" cy="16" r="1.7" fill="currentColor" />
            <circle cx="16" cy="16" r="1.7" fill="currentColor" />
          </svg>
        </div>
        <div className="font-display text-[17px] font-bold uppercase tracking-widest text-[#EDEDEF]">
          Random
        </div>
        <p className="text-[14px] text-[#A6A6AF]">Any open map, picked on start.</p>
        <SelectButton onClick={() => onPick(null)} />
      </>
    );
  } else {
    const mission = missionText(world);
    detail = (
      <>
        <div className={`w-full ${lock ? "grayscale" : ""}`}>
          {mapsReady ? (
            <LevelThumb mapId={world.map ?? OFFICIAL_MAP_IDS[0]} bare />
          ) : (
            <div className="aspect-square bg-[#0b0b0d]" />
          )}
        </div>
        <div className="font-display text-[17px] font-bold uppercase tracking-widest text-[#EDEDEF]">
          {world.name}
        </div>
        <DetailLine label="Mission">{mission.title}</DetailLine>
        <p className="text-[14px] text-[#A6A6AF]">{mission.detail}</p>
        <DetailLine label={lock ? "Opens at" : "Best"}>
          {lock ? (
            <span style={{ color: POINT_COLOR }}>level {lock.level}</span>
          ) : best > 0 ? (
            <span style={{ color: rungColor(best - 1) }}>{rungLabel(best - 1)}</span>
          ) : (
            "New"
          )}
        </DetailLine>
        <SelectButton onClick={() => onPick(world.id)} disabled={lock != null} />
      </>
    );
  }

  return <PickerDialog title="Map" onClose={onClose} list={list} detail={detail} />;
}

/**
 * THE DIFFICULTY LIST: the ten difficulties by name on the left; on the
 * right what the one under the cursor IS — how much of the swarm it sends
 * (and how many bodies that is on the picked map), how many rules it
 * rolls, and what it pays. There is always a cursor: it starts on the
 * difficulty the run is set to, so both panes are on screen from the
 * first frame. The rules themselves are still not spelled out — a player
 * finds those out by playing; only their number is promised.
 *
 * THE ONES THAT ROLL RULES ARE SHUT UNTIL THE SAVE HAS RULES (track.ts
 * difficultyOpen): Nemesis +1 and up promise a number of mutators, and a
 * deck with nothing in it makes that promise a lie. The four named
 * difficulties carry no rules and are open from level 1, so the whole
 * script at full count is always playable.
 *
 * A SHUT ROW IS GREYED IN THE LIST AND NAMES ITS LEVEL IN THE DETAIL —
 * the map list's own arrangement (see MapPicker's "Opens at"), and for
 * the same reason: a row a player cannot click is a question, and the
 * answer costs one line beside the thing they are already looking at.
 * The list itself stays wordless, so nine greyed names do not become
 * nine copies of the same sentence.
 */
/** how big the swarm is, in words, one per named difficulty (COUNT_SCALE) */
const SWARM_SIZE: readonly string[] = [
  "Small amounts of enemies",
  "A medium amount of enemies",
  "Lots of enemies",
  "An insane amount of enemies",
];

function DifficultyPicker({
  tier,
  world,
  level,
  onPick,
  onClose,
}: {
  tier: number;
  /** the picked map, for a body count — null when the run is on Random */
  world: LevelSpec | null;
  /** the level the save PLAYS at — what decides which rows are shut */
  level: number;
  onPick: (tier: number) => void;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState(tier);
  const scale = tierCountScale(focus);
  const rules = tierMutationCount(focus);
  const step = tierMutationStep(focus);
  const swarm = world ? budget(world, focus) : null;
  const open = difficultyOpen(level, rules);

  const list = Array.from({ length: RUNG_COUNT }, (_, t) => {
    const shut = !difficultyOpen(level, tierMutationCount(t));
    return (
      <PickRow key={t} selected={t === tier} focused={t === focus} onPick={() => setFocus(t)}>
        <span
          className={`truncate font-display text-[15px] font-bold uppercase tracking-widest ${
            shut ? "opacity-40" : ""
          }`}
          style={{ color: shut ? "#71717C" : rungColor(t) }}
        >
          {rungLabel(t)}
        </span>
      </PickRow>
    );
  });

  const detail = (
    <>
      <div
        className="font-display text-[19px] font-bold uppercase tracking-widest"
        style={{ color: rungColor(focus) }}
      >
        {rungLabel(focus)}
      </div>
      <p className="text-[14px] text-[#A6A6AF]">
        {step > 0
          ? `${SWARM_SIZE[SWARM_SIZE.length - 1]}, under ${rules} mutator${rules === 1 ? "" : "s"} rolled when the run starts.`
          : `${SWARM_SIZE[Math.min(focus, SWARM_SIZE.length - 1)]}. No mutators.`}
      </p>
      <DetailLine label="Swarm">
        {Math.round(scale * 100)}%
        {swarm ? ` · ${swarm.units.toLocaleString()} units over ${swarm.waves} waves` : ""}
      </DetailLine>
      <DetailLine label="Mutators">{rules === 0 ? "None" : `${rules} rules`}</DetailLine>
      {open ? (
        <DetailLine label="Pays">
          <span style={{ color: XP_COLOR }}>{xpShareText(tierXpBonus(focus))}</span>
        </DetailLine>
      ) : (
        <DetailLine label="Opens at">
          <span style={{ color: POINT_COLOR }}>level {MUTATORS_FROM}</span>
        </DetailLine>
      )}
      <SelectButton onClick={() => onPick(focus)} disabled={!open} />
    </>
  );

  return <PickerDialog title="Difficulty" onClose={onClose} list={list} detail={detail} />;
}


/**
 * THE DEAL STACK'S CELLS — one square each in the field's bottom-right
 * corner, and the tooltip that says what one is.
 *
 * THE CARD IS THE SHARED HoverCard (HoverCard.tsx), the same one the
 * codex tiles and the track's reward chips open, rather than a `title`
 * attribute. A native tooltip waits a second, wears the operating
 * system's own styling and cannot hold a list — and these squares are
 * exactly the things a player glances at mid-wave and needs a straight
 * answer from. It hangs off the anchor's RIGHT edge and opens UPWARD,
 * because the stack is in the right margin at the bottom of the screen.
 */
const DEAL_COLOR = "#FFD37F";

/**
 * THE FAMILY PICTURES, one per family, carved off the PACKED SHEET rather
 * than loaded from /mindustry/sprites/units (atlas.ts unitIcon).
 *
 * The raw sprite file is not the body the game draws: the packed one is
 * outlined, antialiased, and wears its family's colour on its team cell,
 * so a thumbnail off the file showed a picture of upstream's unit — right
 * silhouette, wrong edges, and Mindustry's crux red where the hue that
 * tells a player which family this is belongs.
 *
 * Built ONCE per page, memoised on the promise so overlapping callers
 * share one build, and primed by the boot warm-up so the squares are not
 * empty on the first wave. A failure leaves the map short an entry and
 * the cell falls back to the sprite file.
 */
const FAMILY_ICONS = new Map<FamilyKey, string>();
let familyIconBuild: Promise<void> | null = null;

function buildFamilyIcons(): Promise<void> {
  familyIconBuild ??= Promise.all(
    FAMILIES.map(async (f) => {
      try {
        FAMILY_ICONS.set(f.key, await unitIcon(f.icon, FAMILY_ACCENT[f.key]));
      } catch {
        // the fallback in DealFamiliesCell covers it
      }
    }),
  ).then(() => undefined);
  return familyIconBuild;
}

/** the bottom square: which families the die dealt this map */
function DealFamiliesCell({ families }: { families: readonly FamilyKey[] }) {
  const tip = useHoverCard("up");
  const names = families.map((f) => familyByKey(f).name);
  // the pictures are built off the sheet and so cannot be read on the
  // first render; re-render once they are there
  const [, setCarved] = useState(0);
  useEffect(() => {
    let alive = true;
    void buildFamilyIcons().then(() => {
      if (alive) setCarved((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div
      ref={tip.ref as RefObject<HTMLDivElement | null>}
      {...tip.anchorProps}
      role="listitem"
      tabIndex={0}
      aria-label={`Swarm families: ${names.join(", ")}`}
      className="ms-pane-solid pointer-events-auto flex h-12 w-12 flex-wrap items-center justify-center gap-0.5 p-1 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
    >
      {families.map((f) => (
        <img
          key={f}
          src={
            FAMILY_ICONS.get(f) ??
            `/mindustry/sprites/units/${familyByKey(f).icon}.png`
          }
          alt=""
          className="h-4 w-4 object-contain [image-rendering:pixelated]"
        />
      ))}
      <HoverCard tip={tip} title="Swarm families" tag="Deal" color={DEAL_COLOR} align="right">
        The three families the deploy dealt this run. Every wave sends these
        three, tier for tier, whatever the script was authored in.
        <span className="mt-1.5 block text-[#EDEDEF]">{names.join(" · ")}</span>
      </HoverCard>
    </div>
  );
}

/** one square above it: a rule the run is played under */
function DealRuleCell({ def }: { def: MutationDef }) {
  const tip = useHoverCard("up");
  const band = bandFor(def);
  return (
    <div
      ref={tip.ref as RefObject<HTMLDivElement | null>}
      {...tip.anchorProps}
      role="listitem"
      tabIndex={0}
      aria-label={`${def.name}: ${band.label} mutator. ${def.blurb}`}
      className="ms-tile pointer-events-auto flex h-12 w-12 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
      style={tile(band.color)}
    >
      <MutationFace id={def.id} size="h-7 w-7" />
      <HoverCard tip={tip} title={def.name} tag={band.label} color={band.color} align="right">
        {def.blurb}
      </HoverCard>
    </div>
  );
}

/**
 * THE BAR'S ENTRY FOR EVERY BUILDING: its name and the sprite the menu
 * wears, DERIVED rather than authored.
 *
 * This was a hand-written table of eighteen rows carrying a name and a
 * sprite path apiece — a third copy of two things the game already knows
 * (TOWERS[kind].name and TOWER_ICONS), kept in step by hand. It fell
 * behind the moment the roster grew: a kind missing from the table made
 * MENU_BY_KIND.get return undefined, and the `!` at the call site turned
 * that into a crash on the build card rather than a type error. Reading
 * TOWER_KINDS means the bar cannot miss one again.
 */
const TOWER_MENU: ReadonlyArray<{ kind: TowerKind; name: string; icon: string }> =
  TOWER_KINDS.map((kind) => ({
    kind,
    name: TOWERS[kind].name,
    icon: TOWER_ICONS[kind],
  }));

/** menu entry by kind, for rendering the bar from a list of kinds */
const MENU_BY_KIND = new Map(TOWER_MENU.map((t) => [t.kind, t]));

/**
 * ONE SLOT OF THE BUILD GRID (tech.ts BUILD_SLOTS): a square wearing the
 * building's sprite, its key in the top-left corner and its price in
 * scrap along the bottom, and the shared hover card (HoverCard.tsx)
 * saying what the thing IS.
 *
 * THE CARD IS THE POINT OF THE GRID. A command card is a wall of small
 * pictures, and a picture only teaches a player what a building does if
 * something says so — a `title` attribute waits a second, wears the
 * operating system's styling and cannot hold a price, so this opens the
 * same card the codex tiles and the track's chips do, upward and off the
 * slot's right edge because the grid sits in the bottom-right corner.
 *
 * The price READS AS THE DECISION: it reddens the moment the run cannot
 * cover it, which is what a player is scanning the grid for mid-wave. A
 * free board (the sandbox, the editors) carries no number at all.
 */
function BuildCell({
  slot,
  icon,
  name,
  price,
  targeting,
  poor,
  picked,
  onPick,
}: {
  slot: BuildSlot;
  icon: string;
  name: string;
  price: number | null;
  /** who this turret shoots at, derived from its live stats (Hud.targeting) */
  targeting: string;
  poor: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const tip = useHoverCard("up");
  const label = price === null ? name : `${name} — ${price} scrap`;
  return (
    <button
      ref={tip.ref as RefObject<HTMLButtonElement | null>}
      {...tip.anchorProps}
      aria-label={label}
      aria-keyshortcuts={slot.key}
      aria-pressed={picked}
      onClick={onPick}
      className={`ms-btn ms-btn-key relative aspect-square w-full flex-col justify-center gap-0 p-0 ${
        picked ? "" : "text-[#a2a2a2]"
      } ${poor ? "opacity-60" : ""}`}
    >
      {/* THE KEY, printed on the cap's corner: the sprite fills almost
          the whole square, and a bare letter over it is unreadable */}
      <span aria-hidden="true" className="ms-key">
        {slot.key}
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
      <img src={icon} alt="" className="h-8 w-8 [image-rendering:pixelated]" />
      {price !== null && (
        <span
          className={`font-display text-[10px] font-bold leading-none ${poor ? "text-[#FF8A8A]" : "text-white"}`}
        >
          {price}
        </span>
      )}
      <HoverCard tip={tip} title={name} tag={slot.key} color={BUILD_COLOR} align="right">
        {TOWER_DESC[slot.kind]}
        {/* WHO IT SHOOTS AT, on its OWN LINE under the prose. It is the
            first thing a player checks against the wave coming in, and it
            was buried mid-sentence in the descriptions until it was pulled
            out and derived (targetingLine in constants.ts) */}
        <span className="mt-1.5 block font-bold text-[#A6A6AF]">{targeting}</span>
        {price !== null && (
          <span className="mt-1.5 block text-[#EDEDEF]">{price} scrap</span>
        )}
      </HoverCard>
    </button>
  );
}

/** the grid's own colour — the amber the deal stack's cards wear, so the
 *  two corners of the field answer in one voice */
const BUILD_COLOR = "#FFD37F";

/**
 * THE WORKING COLUMN every full screen of the game is laid out in: one
 * centred stack, capped at a readable width, that SCROLLS when it is
 * taller than the viewport rather than spilling out of both ends
 * ([justify-content:safe_center]).
 *
 * It is a constant rather than a copied class list because the front of
 * house and the pause overlay both raise the SAME settings screen, and a
 * settings panel is a different panel at 27rem than it is at 30 — the
 * in-game copy used to be squeezed into the pause sheet's own 30rem card,
 * where a row's knob wrapped under its label and the tab strip ran to two
 * lines. One column, one width, one screen (settingsBody below).
 *
 * `ui-zoom` is on it, so it must never be nested inside another zoomed
 * element: CSS zoom compounds.
 */
const MENU_COLUMN =
  "ui-zoom relative mx-auto flex min-h-full max-w-5xl flex-col items-center gap-8 py-12 pl-[1.5rem] pr-[1.5rem] [justify-content:safe_center] sm:py-16";
/** ...and the top pad the views that are NOT the title card clear the
 *  corner chrome (back, the level strip) with, in the same zoomed units */
const MENU_COLUMN_PAD = "pt-20 sm:pt-20";

/**
 * THE ONE BACK BUTTON: icon only, big, pinned to the top-left of the
 * viewport — the same spot on every screen that has somewhere to go back
 * to, so the thumb never hunts for it. The label survives as the
 * accessible name.
 *
 * It carries its own `ui-zoom` and is therefore always mounted OUTSIDE
 * the zoomed column, like the dialogs are.
 */
function CornerBack({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="ui-zoom ms-btn fixed left-[1rem] top-[1rem] z-20 h-11 w-11 p-0 text-[#a2a2a2] hover:text-white"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
        <path d="M14.7 5.1 7.8 12l6.9 6.9 1.7-1.7L11.2 12l5.2-5.2z" />
      </svg>
    </button>
  );
}

/**
 * A SECTION OF SETTINGS IS ONE BOX. Every row of a tab lives in this one
 * pane, divided by hairlines (globals.css .ms-rows) — five bevelled boxes
 * stacked up read as five things to deal with, where one box with five
 * rows reads as one section, which is what a tab is.
 */
function SettingsBox({ children }: { children: ReactNode }) {
  return <div className="ms-pane ms-rows w-full max-w-[30rem] px-4">{children}</div>;
}

/**
 * ONE SETTING, ONE ROW: the name on the left, the knob on the right, and
 * NOTHING ELSE. The rows used to carry a line of explanation each ("turn
 * off to improve framerate", "wipes all progress — no undo") and a panel
 * of them read as a page to study rather than a panel to use. A setting
 * whose name does not say what it is wants a better name.
 */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="text-[15px] font-bold uppercase tracking-widest text-[#EDEDEF]">{label}</div>
      {children}
    </div>
  );
}

/**
 * A SETTING WITH A HANDFUL OF NAMED CHOICES, as one segmented control —
 * the same knob the Video tab's display mode wears. Every choice is on
 * screen at once, so picking one is a press rather than a press and a
 * read: a menu that has to be opened to say what it is currently on is
 * the wrong control for four words.
 */
function ChoiceRow<T extends string>({
  label,
  choices,
  value,
  onPick,
}: {
  label: string;
  choices: ReadonlyArray<{ mode: T; label: string }>;
  value: T;
  onPick: (mode: T) => void;
}) {
  return (
    <SettingRow label={label}>
      <div role="group" aria-label={label} className="ms-seg shrink-0">
        {choices.map((c) => (
          <button
            key={c.mode}
            aria-pressed={value === c.mode}
            onClick={() => onPick(c.mode)}
            className="ms-btn px-2.5 py-1.5 text-[15px]"
          >
            {c.label}
          </button>
        ))}
      </div>
    </SettingRow>
  );
}

/** a row that states something rather than setting it — the Info tab */
function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <SettingRow label={label}>
      <div className="text-[15px] text-[#A6A6AF]">{children}</div>
    </SettingRow>
  );
}

/**
 * A SETTING ON A SLIDER WITH STOPS. The steps are the ones the game
 * actually has (UI_SCALES, PAN_SPEEDS) and the slider can only land on
 * them — its `step` is one index — so the knob is a row of buttons that
 * happens to slide: dragging walks the stops, the arrow keys walk them one
 * at a time, and the value the knob is on is printed beside it.
 *
 * It replaces a row of seven or eight percentage buttons, which ran off
 * the panel's width and made picking "a bit faster" a hunt for the right
 * little box.
 */
function StepSlider({
  label,
  steps,
  value,
  onPick,
}: {
  label: string;
  steps: readonly number[];
  value: number;
  onPick: (v: number) => void;
}) {
  const at = Math.max(0, steps.indexOf(value));
  const text = (v: number): string => `${Math.round(v * 100)}%`;
  return (
    <SettingRow label={label}>
      <div className="flex shrink-0 items-center gap-3">
        <input
          type="range"
          className="ms-slider w-40"
          min={0}
          max={steps.length - 1}
          step={1}
          value={at}
          aria-label={label}
          aria-valuetext={text(steps[at])}
          onChange={(e) => onPick(steps[Number(e.target.value)])}
        />
        <div className="w-12 text-right text-[15px] font-bold tabular-nums text-[#EDEDEF]">
          {text(steps[at])}
        </div>
      </div>
    </SettingRow>
  );
}

/**
 * THE SETTINGS SECTIONS, in the order they are printed:
 *
 * - `game` — the save, and nothing else so far. Not offered mid-run,
 *   where wiping the save under a running game is the one thing it holds
 * - `video` — what the game looks like and what window it looks like it
 *   in. The three window rows need the desktop shell and are dropped in a
 *   browser tab (`video` below); Effects is there either way
 * - `interface` — the size of the UI over the field
 * - `controls` — the mouse and the keys
 * - `info` — what this is, who made it, what it came from. Last, because
 *   it is the only tab that sets nothing
 */
type SettingsTab = "game" | "video" | "interface" | "controls" | "info";

/**
 * THE DISPLAY MODES, in the order the Video tab prints them: least to most
 * of the screen taken.
 */
const DISPLAY_MODES: ReadonlyArray<{ mode: DisplayMode; label: string }> = [
  { mode: "windowed", label: "Windowed" },
  { mode: "borderless", label: "Borderless" },
  { mode: "fullscreen", label: "Fullscreen" },
];

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
   * (Progress.difficulty), Incursion on a fresh save.
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
  /** the level the save PLAYS at — the dev door's, so a fully unlocked
   *  save sees every difficulty open. What gates the ladder's top six */
  const playLevel = progress ? effectiveLevel(progress) : 1;
  /** A PICK THAT HAS GONE OUT OF REACH COMES BACK DOWN. The difficulty is
   *  saved with the run (progress.difficulty) and the save that wrote it
   *  may since have been reset, or written by the dev door — either way
   *  the deploy screen must never stand on a difficulty whose Start is
   *  dead. Silent, and it costs nothing: the four named ones are open at
   *  every level, so there is always somewhere for it to land */
  useEffect(() => {
    if (!difficultyOpen(playLevel, tierMutationCount(tier))) setTier(TOP_RULELESS_TIER);
  }, [playLevel, tier]);
  // a finished run's settled payout: non-null exactly while the results
  // overlay shows the breakdown, and the guard against granting twice
  const [result, setResult] = useState<RunReward | null>(null);
  // non-null exactly while the loading screen is up, including its fade
  const [loadUi, setLoadUi] = useState<LoadUi | null>(null);
  /**
   * THE BOOT SCREEN: non-null from the very first render of the page until
   * the front of house is worth looking at, including its own fade. It is
   * the first thing painted rather than something switched on by an effect
   * — a title card that appears and is then covered is a flash, and the
   * whole point of this is that nobody sees the menu half-built.
   */
  const [boot, setBoot] = useState<{ step: BootStep; out: boolean } | null>({
    step: "sprites",
    out: false,
  });
  /** the boot lifts once and stays lifted, whichever way it was earned */
  const booted = useRef(false);
  const reveal = useRef<((force: boolean) => void) | null>(null);
  /** the two halves of the warm-up, each set by whoever finishes it */
  const ready = useRef({ icons: false, ground: false });
  const granted = useRef(false);
  /**
   * Where the progress screen was opened FROM. A loss is the moment it is
   * most worth reading — the run just banked everything its towers killed on
   * the way down — so the defeat panel offers it, and leaving from there has
   * to come back to the run rather than dump the player on the level list.
   */
  const [techFrom, setTechFrom] = useState<"menu" | "game">("menu");
  /**
   * THE RULES THIS RUN IS PLAYED UNDER, for the corner panel — the level's
   * own and the roll alike, as the deploy dialog listed them. A player who
   * skimmed the dialog and is now three waves in wants to know why the
   * swarm is doing what it is doing; this is where that answer lives on
   * the field.
   */
  const hudRules = useMemo(
    () =>
      level
        ? mutationsInForce(level.mutation)
            .map(mutationById)
            .filter((m): m is NonNullable<typeof m> => m !== null)
        : [],
    [level],
  );
  /**
   * Ambient effects on? A saved preference (Progress.effects) like the
   * pace and the HUD state, because it is a fact about the DEVICE — a
   * phone that could not afford the particles last run cannot this run
   * either. Defaults to on; only an explicit false in the save is off.
   */
  const [effects, setEffects] = useState(true);
  /**
   * The HUD size — a saved preference (Progress.uiScale) like `effects`.
   * Which settings panel is up is NOT saved: settings always opens on the
   * first tab the way every other screen opens at its top.
   */
  const [uiScale, setUiScale] = useState(UI_SCALE_DEFAULT);
  /**
   * WHO WEARS A HEALTH BAR on the field, one knob a side (Progress.allyBars,
   * Progress.enemyBars). Saved preferences like `uiScale`, and live: both
   * reach a run under way the moment they are touched
   * (Game.setHealthBars), which is what makes the pause overlay's copy of
   * the panel worth having — the field is right there behind it.
   */
  const [allyBars, setAllyBars] = useState<HealthBarMode>(HEALTH_BARS_DEFAULT);
  const [enemyBars, setEnemyBars] = useState<HealthBarMode>(HEALTH_BARS_DEFAULT);
  /**
   * ...AND WHO WEARS THE ROW OF STATUS SYMBOLS over that
   * (Progress.statusMarks, Game.setStatusMarks). One knob for both sides,
   * saved and live like the bars.
   */
  const [statusMarks, setStatusMarks] = useState<StatusMode>(STATUS_MARKS_DEFAULT);
  /**
   * THE CONTROLS — saved preferences like `uiScale` (Progress.panSpeed,
   * Progress.edgePan): how fast the keys and the screen's edges pan the
   * view, and whether the edges pan it at all. Both reach a run under way
   * the moment they are touched (Game.setPanSpeed, Game.setEdgePan).
   */
  const [panSpeed, setPanSpeed] = useState<number>(PAN_SPEED_DEFAULT);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("game");
  /**
   * THE DISPLAY, as the desktop shell has it: the mode the window is in,
   * the monitors there are, and which one the game is on. NOT a saved
   * preference like the rest of the panel — the shell owns it, because it
   * has to know before the game boots, and it keeps it in window.json
   * beside the save (desktop/src/display.ts).
   *
   * Null in a browser tab, where there is no shell to ask, and that is
   * what drops the Video tab from a web build: nothing there is the
   * game's to set. The shell pushes every change back — a mode set here,
   * F11, the window dragged to another screen, a monitor unplugged — so
   * the tab is never showing something the window is not doing.
   */
  const [video, setVideo] = useState<DisplayState | null>(null);
  useEffect(() => {
    const d = displayControls();
    if (!d) return;
    setVideo(d.get());
    return d.onChange(setVideo);
  }, []);
  /**
   * THE MINIMAP'S CANVAS. React mounts it with the game screen and hands
   * it to the game (Game.attachMinimap), which paints it every frame and
   * takes the presses on it. A callback ref rather than a plain one
   * because the element comes and goes with the run's state, and the game
   * must be told each time so it never paints a canvas nobody can see.
   */
  const mmRef = useRef<HTMLCanvasElement | null>(null);
  const attachMinimap = useCallback((el: HTMLCanvasElement | null) => {
    mmRef.current = el;
    gameRef.current?.attachMinimap(el);
  }, []);
  /**
   * ESCAPE LEAVES A MENU VIEW, the same as the arrow top-left (the `back`
   * button below) — and on the title card, where there is nothing behind
   * to go back to, it asks whether to quit instead, which is the door the
   * Exit button opens. In a run Escape is the game's own key (game.ts
   * backs out of a build, then opens the pause menu). The tech screen and
   * the boards bind their own through BackButton.
   */
  const escapeToMenuHome = useCallback(() => setMenuView("home"), []);
  /**
   * THE GAME'S OWN QUESTIONS — the wipe, the quit — as one dialog rendered
   * at the bottom of this component, outside every ui-zoom wrapper.
   * Nothing here calls window.confirm.
   */
  const { confirm, dialog: confirmDialog } = useConfirm();
  /**
   * IS THERE A WINDOW OF OURS TO CLOSE? Only in the desktop shell: a
   * browser tab is the player's own and script cannot close it, so the
   * web build has no Exit button and Escape on the title card does
   * nothing. Read in an effect rather than at render, because the bridge
   * is not there when the markup is prerendered.
   */
  const [quitAble, setQuitAble] = useState(false);
  useEffect(() => setQuitAble(canQuit()), []);
  const askQuit = useCallback(async () => {
    if (
      await confirm({
        title: "Quit Game",
        body: "Are you sure you want to quite the game?",
        confirmLabel: "Quit",
        cancelLabel: "Stay",
      })
    ) {
      quitGame();
    }
  }, [confirm]);
  /** the same door, as the plain callback useEscapeBack takes */
  const escapeToQuit = useCallback(() => void askQuit(), [askQuit]);
  useEscapeBack(
    screen === "menu"
      ? menuView !== "home"
        ? escapeToMenuHome
        : quitAble
          ? escapeToQuit
          : null
      : null,
  );
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
    setEffects(p.effects ?? true);
    setUiScale(p.uiScale ?? UI_SCALE_DEFAULT);
    setPanSpeed(p.panSpeed ?? PAN_SPEED_DEFAULT);
    setAllyBars(p.allyBars ?? HEALTH_BARS_DEFAULT);
    setEnemyBars(p.enemyBars ?? HEALTH_BARS_DEFAULT);
    setStatusMarks(p.statusMarks ?? STATUS_MARKS_DEFAULT);
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
    // the sandbox lifts the LOCKS, not the economy: the run stays charged
    // (same prices, same deal, same odds in the corner) and the purse just
    // never empties. Leaving hands the player's own scrap back, so the
    // turrets, mods and relics bought in there come out with the run
    g.setRich(admin);
    // dropping out of sandbox drops a sandbox-only pace with it, or the run
    // keeps running at a speed whose button is no longer on screen. What the
    // save allows is the utilities path rather than a constant, so it falls
    // back the same way a fresh run starts: the remembered pace, stepped
    // down to the fastest one this save actually owns
    if (!admin && !tech.speeds.includes(g.ui().speed))
      g.setSpeed(startingSpeed(loadProgress(), tech.speeds));
    setHud(g.ui());
  }, [admin, level?.tier]);

  /**
   * THE BOOT, in the order the boot screen names it (BOOT_STEPS).
   *
   * It USED to be one fire-and-forget Promise.all under a menu that was
   * already on screen, which is exactly what the player saw: a title card
   * over black, and the battlefield behind it arriving several seconds
   * later once the sheet had packed, the documents had landed and the
   * menu's own sim had carved its map. The work has not changed; what has
   * changed is that the page is covered until it is done.
   *
   * The sheet goes first because everything else is cut out of it and it is
   * the one genuinely long step (~200ms of packing, once per page). Then
   * the documents — level documents overlay WORLDS in place (see levels.ts),
   * so a script edited in the admin level editor is what the menu counts and
   * the run plays; a level with no document keeps the campaign as shipped.
   *
   * The last step is the warm-up, and it is TWO things finishing rather than
   * one: the turret pictures cut from the sheet here, and the renderer that
   * MenuBackground stands up to draw the ground — its GL context, its shader
   * programs and the sheet uploaded as a texture, none of which exist until
   * something asks for a frame. The ground reports itself (onReady →
   * `revealMenu`); the boot lifts when both have landed.
   *
   * NOTHING HERE IS FATAL. A fetch that fails leaves the cards on text and
   * the game to retry at level start, exactly as before — it must not leave
   * the player looking at a loading bar that will never move.
   */
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!atlasReady()) await buildAtlas().catch(() => {});
      if (!alive) return;
      setBoot((b) => (b ? { ...b, step: "maps" } : b));
      await Promise.all([
        loadOfficialMaps(),
        loadLevelDocs(),
        loadBalanceDoc(),
      ]).catch(() => {});
      if (!alive) return;
      setMapsReady(true);
      setBoot((b) => (b ? { ...b, step: "warmup" } : b));
      // the bar's and the deploy screen's turret pictures, each one a
      // region of the sheet drawn out to its own canvas: cheap, but a
      // screenful of them popping in after the menu is up is exactly the
      // half-built front of house this screen exists to hide
      const [entries] = await Promise.all([
        Promise.all(
          TOWER_MENU.map(async (t) => [t.kind, await turretIcon(t.icon)] as const),
        ).catch(() => [] as (readonly [TowerKind, string])[]),
        // the deal stack's family pictures, carved off the same sheet
        buildFamilyIcons(),
      ]);
      if (!alive) return;
      setIcons(Object.fromEntries(entries));
      ready.current.icons = true;
      reveal.current?.(false);
    })();
    // the belt to the warm-up's braces, and never the thing that lifts a
    // healthy boot: a cold page is a second or two of packing and a few of
    // carving, and this is half a minute (see BOOT_MAX_MS)
    const cap = setTimeout(() => reveal.current?.(true), BOOT_MAX_MS);
    return () => {
      alive = false;
      clearTimeout(cap);
    };
  }, []);

  /**
   * Take the boot screen down: mark it leaving, and drop it once the fade
   * it is leaving through has finished.
   *
   * It is a one-shot, and it is patient: every part of the warm-up calls it
   * when it lands and it does nothing until they all have (`ready`), so no
   * caller has to know what the others are waiting on. `force` is the cap's
   * door out — a boot that has waited long enough is shown whatever is
   * still missing.
   */
  const revealMenu = useCallback((force: boolean) => {
    if (booted.current) return;
    if (!force && !(ready.current.icons && ready.current.ground)) return;
    booted.current = true;
    setBoot((b) => (b ? { ...b, out: true } : b));
    setTimeout(() => setBoot(null), FADE_MS);
  }, []);
  // the boot effect runs before this is declared and holds it by reference,
  // so its cap can fire the same one-shot the warm-up does
  reveal.current = revealMenu;
  /** MenuBackground's end of the warm-up: its renderer exists and has drawn */
  const groundReady = useCallback(() => {
    ready.current.ground = true;
    reveal.current?.(false);
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
    // straight past the front of house: the level's own loading screen takes
    // over from here, and the menu's ground is never built to wait on
    booted.current = true;
    setBoot(null);
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
        // a sandbox run comes up lit, the same as one toggled into it
            // the device's own preference, read from the save rather than
        // from state: this runs once at create, and a run started right
        // after a toggle must not come up with last render's value
        g.setEffects(save.effects ?? true);
        // the pace carries across runs and across sessions — a player who
        // plays at 4x wants 4x again after a loss, not 1x and a click
        g.setSpeed(startingSpeed(save, admin ? SPEEDS : techOf(save).speeds));
        // the controls, off the save for the same reason as the effects
        g.setPanSpeed(save.panSpeed ?? PAN_SPEED_DEFAULT);
        g.setHealthBars(save.allyBars ?? HEALTH_BARS_DEFAULT, save.enemyBars ?? HEALTH_BARS_DEFAULT);
        g.setStatusMarks(save.statusMarks ?? STATUS_MARKS_DEFAULT);
        // the minimap's canvas is already mounted under the loading screen
        g.attachMinimap(mmRef.current);
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
        if (ADMIN_ENABLED) {
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
        // the waves cleared are the objectives met, and the objectives are
        // what the mission pays for (missionXp) — a win is every one
        const reward = grantRunReward(
          level.tier ?? 0,
          ui.wavesCleared,
          ui.totalWaves,
          ui.won,
          level.id,
          runRandom,
        );
        const after = loadProgress();
        setResult(reward);
        setProgress(after);
        // the run is over, so its sandbox is too — the next one deployed
        // from the menu starts on what the save actually owns (see `admin`)
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

  /** the run state, re-read now rather than at the next poll — what every
   *  click that changes something asks for on its way out */
  const refresh = useCallback((): void => {
    const g = gameRef.current;
    if (g) setHud(g.ui());
  }, []);

  /**
   * THE DEAL (Deal.tsx): the cards a charged run buys its turrets as. It
   * is hung off the same HUD poll everything else in the corner is, and it
   * is inert on a free board — the sandbox and the editors keep the
   * command card, where a turret is picked by name.
   */
  const deal = useDeal(gameRef, hud, refresh);

  const pickTower = (kind: TowerKind): void => {
    const g = gameRef.current;
    if (!g) return;
    const next = hud?.buildKind === kind ? null : kind;
    g.setBuildKind(next);
    setHud(g.ui());
  };

  /**
   * THE GRID'S KEYS PICK A BUILDING (tech.ts BUILD_SLOTS): one key a
   * slot, and the press is the same press as a click on that slot — it
   * TOGGLES, so the same letter twice puts the building back down again
   * empty-handed, exactly as clicking the lit slot twice does.
   *
   * It lives here rather than in Game.onKeyDown because the GRID is
   * React's: which buildings ride which slot is the roster and the
   * save's unlocks, and the game engine knows nothing about either. It
   * asks the engine for the live run state rather than reading `hud`, so
   * a press is answered against what is true now and not against a
   * snapshot up to 100ms stale — and it works while the game is paused,
   * since planning a lane is most of what pausing is for.
   *
   * IT DECLINES THE SAME PRESSES THE GRID WOULD. Nothing happens with a
   * modifier held (ctrl+Q and cmd+Q belong to the browser and the
   * system, and stealing those would be a bug rather than a feature),
   * with a text field focused, or once the run has ended or the pause
   * menu is up — the grid is gone in all three cases.
   *
   * `code` RATHER THAN `key`, because it is the physical key: a layout
   * that puts something else where Q is printed still picks the building
   * under the finger, which is the whole point of a grid shortcut.
   * Registered ONCE for the run — it depends on nothing that changes.
   */
  useEffect(() => {
    if (screen !== "game") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (
        e.target instanceof HTMLElement &&
        e.target.closest("input, textarea, [contenteditable]")
      )
        return;
      const slot = slotForCode(e.code);
      if (!slot) return;
      const g = gameRef.current;
      if (!g) return;
      const ui = g.ui();
      if (ui.lost || ui.won || ui.menuOpen) return;
      // ...and there is no grid on a DEALT board: a charged run's turrets
      // come off the deal, so a letter that used to drop a spectre must
      // not still drop one for free
      if (ui.dealing) return;
      if (ui.unlocked && !ui.unlocked.includes(slot.kind)) return;
      e.preventDefault();
      g.setBuildKind(ui.buildKind === slot.kind ? null : slot.kind);
      setHud(g.ui());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

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
   * START, from the macros as they stand. Random resolves to any map the
   * track has opened; the picks are remembered (saveRunPick) so the next
   * launch opens on them.
   *
   * THE MUTATORS ARE ROLLED HERE, ON THE PRESS, and this is the only
   * place they are rolled. As many rules as the difficulty asks for,
   * costing no more than the points it carries (both dials on the rung).
   * A named difficulty carries zero of each and so rolls nothing. The
   * families are rolled here too, against the map's doors.
   *
   * IT USED TO ROLL ON THE DEPLOY SCREEN, once per (map, difficulty), so
   * that the panel could show the roll before the press. Nothing shows it
   * now — a run's rules are the run's news — so the roll waits for the
   * press, which is also what makes it a roll: a preview a player could
   * see was a preview a player could re-roll by touching a macro.
   */
  const startRun = (): void => {
    const p = progress ?? loadProgress();
    const open = WORLDS.filter((w) => worldLock(p, w.id) == null);
    // a remembered pick the track has since closed (a wiped save) plays
    // as Random rather than as a map the save may not enter
    const picked = pickedWorld && worldLock(p, pickedWorld.id) == null ? pickedWorld : null;
    const random = picked == null;
    const w = picked ?? open[Math.floor(Math.random() * open.length)] ?? WORLD;
    // THE DECK IS WHAT THE TRACK HAS OPENED. Past the roster phase every
    // level puts one more rule in the bag (MUTATOR_UNLOCKS); everything
    // still locked is kept out of this draw, so a save inside the roster
    // phase deploys clean however hard the tier it picked is
    const roll = rollMutations(
      tierMutationPoints(tier),
      tierMutationCount(tier),
      lockedMutators(effectiveLevel(p)),
    );
    saveRunPick(tier, picked?.id ?? null);
    setRunRandom(random);
    // the family die is rolled inside runSpec, against the script it is
    // dealt into — see there for why it cannot be rolled out here
    setLevel(runSpec(w, tier, roll));
    setScreen("game");
    // raised in the same batch as the screen switch, so the game screen's
    // FIRST paint is already covered - an effect would run after that
    // paint and let a frame of black canvas through
    setLoadUi({ step: firstLoadStep(), out: false });
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
  const settingsPanel = (inGame: boolean) => {
    // the sections there are HERE: the save cannot be wiped from under a
    // running game, so mid-run there is no Game tab to show at all — and
    // a tab that is not there cannot be the one that is open
    const tabs: ReadonlyArray<[SettingsTab, string]> = [
      ...(inGame ? [] : ([["game", "Game"]] as [SettingsTab, string][])),
      ["video", "Video"],
      ["interface", "Interface"],
      ["controls", "Controls"],
      ["info", "Info"],
    ];
    const tab = tabs.some(([t]) => t === settingsTab) ? settingsTab : tabs[0][0];
    return (
      <>
        <div role="tablist" aria-label="settings sections" className="ms-seg">
          {tabs.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setSettingsTab(t)}
              className="ms-btn px-5 py-2 text-[15px]"
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "game" && (
          <SettingsBox>
            <SettingRow label="Reset save">
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: "Wipe all progress?",
                    body: "Resources, tech and every cleared rung go back to nothing. This cannot be undone.",
                    confirmLabel: "Wipe",
                  });
                  if (ok) {
                    resetProgress();
                    const p = loadProgress();
                    setProgress(p);
                    setTier(0);
                    setMapPick(null);
                  }
                }}
                className="ms-btn ms-btn-red shrink-0 px-3 py-1.5 text-[15px]"
              >
                Wipe
              </button>
            </SettingRow>
          </SettingsBox>
        )}

        {/* VIDEO — what the game looks like, and what window it looks like
            it in. The window rows are the shell's to change and not the
            save's to remember: every press goes straight out over the
            bridge, and what comes back is what the window is now doing
            (see `video` above). In a browser tab there is no window of
            ours to set and the rows are not rendered; Effects is a fact
            about the device and is there either way. */}
        {tab === "video" && (
          <SettingsBox>
            {video && (
              <SettingRow label="Display mode">
                <div role="group" aria-label="Display mode" className="ms-seg shrink-0">
                  {DISPLAY_MODES.map(({ mode, label }) => (
                    <button
                      key={mode}
                      aria-pressed={video.mode === mode}
                      onClick={() => displayControls()?.setMode(mode)}
                      className="ms-btn px-2.5 py-1.5 text-[15px]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </SettingRow>
            )}

            {/* WHICH SCREEN TO PLAY ON, as the list of screens the system
                reports — named the way the system names them, because a
                desk with two identical monitors has nothing else to tell
                them apart, and a numbered button says nothing at all. */}
            {video && (
              <SettingRow label="Monitor">
                <select
                  aria-label="Monitor"
                  className="ms-select max-w-[19rem] shrink-0 px-3 py-1.5 text-[15px]"
                  value={video.displayId}
                  onChange={(e) => displayControls()?.setMonitor(Number(e.target.value))}
                >
                  {video.displays.map((d, i) => (
                    <option key={d.id} value={d.id}>
                      {`${i + 1}. ${d.label} · ${d.width}×${d.height}${d.primary ? " · primary" : ""}`}
                    </option>
                  ))}
                </select>
              </SettingRow>
            )}

            {/* every turret still shows its shot with effects off (see
                Sim.setEffects) — what goes is the dressing around it */}
            <SettingRow label="Effects">
              <button
                aria-pressed={effects}
                onClick={() => {
                  const next = !effects;
                  setEffects(next);
                  saveEffects(next); // a preference about the device
                  // live: a run under way takes it on the next frame
                  gameRef.current?.setEffects(next);
                }}
                className="ms-btn w-16 shrink-0 px-3 py-1.5 text-[15px]"
              >
                {effects ? "On" : "Off"}
              </button>
            </SettingRow>
          </SettingsBox>
        )}

        {tab === "interface" && (
          <SettingsBox>
            <StepSlider
              label="UI size"
              steps={UI_SCALES}
              value={uiScale}
              onPick={(scale) => {
                setUiScale(scale);
                saveUiScale(scale); // remembered across sessions
              }}
            />
            {/* WHEN A BODY WEARS ITS HEALTH, one knob a side — the player's
                own bars run the HUD's green-amber-red ramp, the swarm's are
                red throughout, and that is the whole of how a bar says
                whose it is (Game.drawUnitBars). Two knobs rather than one
                because the two questions are not the same question: a
                player who wants every wound they are landing on the swarm
                in front of them usually does not want their own board
                under a hedge of green at the same time. */}
            <ChoiceRow
              label="Ally health bars"
              choices={HEALTH_BAR_MODES}
              value={allyBars}
              onPick={(mode) => {
                setAllyBars(mode);
                saveAllyBars(mode); // remembered across sessions
                gameRef.current?.setHealthBars(mode, enemyBars); // live, mid-run
              }}
            />
            <ChoiceRow
              label="Enemy health bars"
              choices={HEALTH_BAR_MODES}
              value={enemyBars}
              onPick={(mode) => {
                setEnemyBars(mode);
                saveEnemyBars(mode);
                gameRef.current?.setHealthBars(allyBars, mode);
              }}
            />
            {/* WHEN A BODY WEARS WHAT IS HAPPENING TO IT (status.ts): the
                soak, the burn, the rot, the fact that a turret is not ours
                any more. One knob for both sides, because that question
                does not change with who owns the thing — and `Selected`
                for a player who wants a clean field and the row only on
                what they clicked, which the inspector prints in full
                anyway. Zoomed out past where a symbol resolves there is
                no row at any setting (Game.statusLegible). */}
            <ChoiceRow
              label="Status icons"
              choices={STATUS_MODES}
              value={statusMarks}
              onPick={(mode) => {
                setStatusMarks(mode);
                saveStatusMarks(mode); // remembered across sessions
                gameRef.current?.setStatusMarks(mode); // live, mid-run
              }}
            />
          </SettingsBox>
        )}

        {tab === "controls" && (
          <SettingsBox>
            {/* one knob for both ways of panning without the mouse button
                — the keys and the screen's edges share PAN_RATE in
                game.ts, so what feels right for one feels right for the
                other */}
            <StepSlider
              label="Pan speed"
              steps={PAN_SPEEDS}
              value={panSpeed}
              onPick={(mult) => {
                setPanSpeed(mult);
                savePanSpeed(mult); // remembered across sessions
                gameRef.current?.setPanSpeed(mult); // live, mid-run
              }}
            />
          </SettingsBox>
        )}

        {/* INFO — the three lines that used to be scattered over the
            front of house: the build number the corner prints, whose game
            this is (it was under the title card) and what it came from (it
            was under this very panel). One place to look them up, and a
            title screen that carries the game's name and nothing else. */}
        {tab === "info" && (
          <SettingsBox>
            <FactRow label="Version">{`v${BUILD}`}</FactRow>
            <FactRow label="Created by">Zerkka</FactRow>
            <FactRow label="Inspired by">
              <a
                href="https://mindustrygame.github.io/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[#4A4A55] underline-offset-2 hover:text-[#EDEDEF]"
              >
                Mindustry
              </a>
            </FactRow>
          </SettingsBox>
        )}
      </>
    );
  };

  /**
   * THE SETTINGS SCREEN'S CONTENTS — a heading and the panel, and nothing
   * about WHERE it is standing. Both callers drop it into the same
   * MENU_COLUMN, so the screen the pause overlay raises is the screen the
   * front of house raises: same width, same tab strip, same rows.
   */
  const settingsBody = (inGame: boolean) => (
    <>
      <h2 className="ms-heading text-[17px]">Settings</h2>
      {settingsPanel(inGame)}
    </>
  );

  if (webglError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0b0b0d]">
        <p className="p-8 text-center text-[#A6A6AF]">{webglError}</p>
      </div>
    );
  }

  if (screen !== "game" || !level) {
    /**
     * THE PROGRESS BOARD is a VIEW OF THE FRONT OF HOUSE, not a screen of
     * its own — it used to return before the menu did, which unmounted the
     * menu's ground with it: walking to the track and back threw away the
     * carved map and the batches on the GPU and built another, and the page
     * hitched for as long as that took. Now it stands in the menu's place
     * inside the same shell, the ground behind it is the same ground, and
     * it is only told to stop drawing while the board covers it.
     */
    const board =
      screen === "tech" && progress ?
        <ProgressView
          progress={progress}
          // after a battle the exit is the menu; from the menu it is the
          // menu too, one step back
          onBack={techFrom === "game" ? backToMenu : leaveTech}
          backLabel={techFrom === "game" ? "Back to menu" : "Back"}
        />
      : null;
    /**
     * THE LEVEL AND THE WAY TO READ IT: the number, and the Progress button
     * to its right, pinned to the top-RIGHT corner — the opposite corner
     * from back, so each corner holds one thing. On the deploy screen and
     * never on the title card: a level only means anything next to the
     * run it is about to be spent on.
     */
    const bank = progress && (
      <div className="ui-zoom fixed right-[1rem] top-[1rem] z-20 flex h-11 items-center gap-3 text-[15px]">
        <LevelStrip xp={progress.xp} />
        <button
          onClick={() => {
            setTechFrom("menu");
            setScreen("tech");
          }}
          className="ms-btn ms-btn-accent px-4 py-2 text-[15px]"
        >
          Progress
        </button>
      </div>
    );
    const back = (label: string) => (
      <CornerBack label={label} onClick={() => setMenuView("home")} />
    );
    return (
      // every menu view scrolls if it has to: the title card fits any
      // screen at 100%, but at a big UI size on a short screen it can
      // stand taller than the viewport, and a card that scrolls beats one
      // whose Settings button is clipped off the bottom. A finger cannot
      // bounce it: html and body refuse overscroll (globals.css)
      <div className="fixed inset-0 overflow-y-auto bg-[#0b0b0d]">
        {/* THE GROUND: a campaign map's own country behind the menu
            (MenuBackground) — the real terrain, drawn by the game's own
            renderer, holding one framing at a time and cutting to the next
            through black. It is mounted once HERE, above every view and
            the progress board alike, so nothing a player presses on the
            front of house ever rebuilds it; only the wash over it changes
            — light on the title card, darker under the deploy screen,
            which is a thing to read, and the drawing stops outright while
            the board is standing over it */}
        <MenuBackground
          dim={menuView === "home" ? 0.38 : 0.66}
          hidden={board !== null}
          onReady={groundReady}
        />
        {board}
        {!board && (
          <>
          {/* EVERY VIEW TAKES THE UI-SIZE KNOB, the title card included: it
              used to sit out at one composed size, and a knob that scaled
              every screen but the first one read as the first one being
              broken. The working views also clear the corner chrome (back,
              the level and Progress) with a top pad in their own zoomed
              units, so a HUD at 200% does not stand the heading under the
              level strip — and the centring is SAFE: a column taller than
              the screen starts at the pad and scrolls, instead of spilling
              out of both ends */}
          <div className={`${MENU_COLUMN} ${menuView === "home" ? "" : MENU_COLUMN_PAD}`}>
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
                  <h1 className="font-display text-5xl font-bold uppercase tracking-[0.02em] [text-shadow:4px_4px_0_#000] sm:text-6xl">
                    <span className="text-[#EDEDEF]">Mech</span>
                    <span className="text-[#FFD37F]">
                      Swarm
                    </span>
                  </h1>
                </div>
                <div className="flex w-full max-w-[20rem] flex-col gap-3">
                  <button
                    onClick={() => setMenuView("deploy")}
                    className="ms-btn ms-btn-accent w-full py-3.5 text-[17px]"
                  >
                    Start
                  </button>
                  <button
                    onClick={() => setMenuView("settings")}
                    className="ms-btn w-full py-3.5 text-[17px]"
                  >
                    Settings
                  </button>
                  {/* THE LAST DOOR, and the only one that leads out of the
                      game: it asks before it takes anyone through
                      (askQuit), and Escape on this screen presses it. Only
                      the desktop shell has a window of ours to close — a
                      browser tab is the player's own */}
                  {quitAble && (
                    <button
                      onClick={() => void askQuit()}
                      className="ms-btn w-full py-3.5 text-[17px]"
                    >
                      Exit
                    </button>
                  )}
                </div>
                {/* no credit line under the buttons: the hero screen carries
                    the game's name and the two things to do with it. Who made
                    it and what it came from are on the Info tab of Settings */}
              </>
            )}

            {/* THE DEPLOY SCREEN. The two macros a run is chosen by, and
                Start under them. There is no map grid and no deploy dialog
                any more: a run is two picks, each one press away, and the
                defaults (Random, Incursion) are a run in themselves */}
            {menuView === "deploy" && (
              <>
                <div className="flex w-full max-w-[28rem] flex-col gap-3">
                  {/* THE MACROS: what the next run is, as two rows that read
                      as a sentence — this map, at this level — and what
                      each pays, in the XP colour, so the trade is on the
                      screen before either list is opened */}
                  <div className="flex flex-col gap-2">
                    <MacroButton
                      label="Map"
                      value={pickedWorld ? pickedWorld.name : "Random"}
                      onClick={() => setPicker("maps")}
                    >
                      <span className="text-[#EDEDEF]">
                        {pickedWorld ? pickedWorld.name : "Random"}
                      </span>
                    </MacroButton>
                    <MacroButton
                      label="Difficulty"
                      value={`${rungLabel(tier)}, ${xpShareText(tierXpBonus(tier))}`}
                      onClick={() => setPicker("difficulty")}
                    >
                      <span style={{ color: rungColor(tier) }}>{rungLabel(tier)}</span>
                      <span className="text-[14px]" style={{ color: XP_COLOR }}>
                        {xpShareText(tierXpBonus(tier))}
                      </span>
                    </MacroButton>
                  </div>
                  {/* NOTHING HERE SAYS WHAT THE RUN WILL BE PLAYED UNDER.
                      The roll used to sit under the macros as a row of
                      faces, which meant the deploy screen answered the
                      question the first wave is supposed to: a player read
                      the rules, weighed them and re-picked the map to
                      re-roll them. The rules are a thing the run tells you,
                      not a thing the menu offers — they are on the HUD
                      (hudRules) from the first frame of the field, and the
                      codex on the progress screen says what each one does */}
                  {/* ONE ACTION, at the bottom: this map, at this level, go */}
                  <button
                    onClick={startRun}
                    className="ms-btn ms-btn-accent mt-2 w-full py-3.5 text-[17px]"
                  >
                    Start
                  </button>
                </div>
              </>
            )}

            {/* SETTINGS - everything that changes the save rather than the run.
                Wiping is the only one so far, and it lives here rather than
                beside the deploy button where a mis-tap would be costly */}
            {menuView === "settings" && settingsBody(false)}
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
              world={pickedWorld}
              level={playLevel}
              onClose={() => setPicker(null)}
              onPick={(t) => {
                setTier(t);
                saveRunPick(t, pickedWorld?.id ?? null);
                setPicker(null);
              }}
            />
          )}

          </>
        )}

        {/* THE BOOT SCREEN, over the whole front of house and everything in
            it. It is painted on the first render and stays up until the
            ground behind the menu is a battle rather than a black rectangle
            (MenuBackground's onReady), so what the player uncovers is the
            finished thing: the name, the two buttons, and a field with the
            swarm walking it already */}
        {boot && (
          <LoadingScreen
            label={BOOT_STEP_LABEL[boot.step]}
            // HALF A STEP, not a whole one: the last boot stage is the long
            // one, and a bar sitting at 100% for the three seconds a map is
            // carved in reads as a hang. Each stage stands in the middle of
            // its own share of the bar — never empty, never full while
            // something is still being waited on
            fill={(BOOT_STEPS.indexOf(boot.step) + 0.5) / BOOT_STEPS.length}
            out={boot.out}
            cover="fixed z-50"
          />
        )}
        {/* THE GAME'S OWN "ARE YOU SURE" (ConfirmDialog) — the wipe, the
            quit. Last, outside the zoom wrapper and over everything: a
            question stands in front of whatever asked it */}
        {confirmDialog}
      </div>
    );
  }

  // how much is on the field right now, as one number — the HUD's enemy
  // count. byKind is the per-kind census the sim keeps anyway; the panel
  // only ever wants the total (see the count in the wave panel below).

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
        {loadUi && (
          <LoadingScreen
            label={LOAD_STEP_LABEL[loadUi.step]}
            fill={(LOAD_STEPS.indexOf(loadUi.step) + 1) / LOAD_STEPS.length}
            out={loadUi.out}
          />
        )}
        {hud?.paused && (
          // on a phone the wave panel already fills the top of the screen, so
          // the badge drops onto the map rather than landing on top of it
          <div className="ms-pane absolute left-1/2 top-[30%] -translate-x-1/2 border-[#FFD37F] px-4 py-1.5 font-display text-base font-bold uppercase text-[#FFD37F] sm:top-[1rem]">
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
                <div className="mb-0.5 text-center text-[12px] font-bold uppercase tracking-widest text-[#F25555] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
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
        {/* THE TOP-LEFT CORNER IS WHAT IS TRUE OF THE RUN, and no longer
            the bank. It was a panel once — a bevelled box with the core's
            health bar across the top and the scrap underneath — and both
            of those are said better elsewhere now: the core wears its own
            health bar on the board like every other building does
            (drawStructureBars), and the scrap moved down to the
            bottom-right, one line above the prices it is read against.
            What hangs here is the standing state — the relics, the
            sandbox pace strip, the mission's objective lines — and the
            stack is as wide as the widest of those, the objective lines,
            which read as sentences and must not wrap. */}
        {hud && (
          <div className="ui-zoom absolute left-[1rem] top-[1rem] flex w-[34rem] max-w-[calc(100vw-8rem)] flex-col items-start gap-2">
            {/* THE RELIC SHELF (components/Relics.tsx), over everything
                else the corner says. An upgrade is a RULE in force for
                the rest of the run, so it heads the corner that holds
                what is true of the run for good. */}
            <RelicShelf relics={hud.relics} />
            {admin && !hud.lost && !hud.won && !hud.menuOpen && (
              /* THE PACE STRIP IS SANDBOX'S, and nothing else on the field
                 is. A campaign run plays at 1x — the multipliers have
                 always been admin-only — and the pause button beside them
                 was the whole strip for everyone else: one button, sitting
                 over the field for a whole run, for a thing SPACE does and
                 the gear in the other corner does (the menu holds the sim
                 the moment it opens, and it is on screen for a touch that
                 has no space bar). A control that duplicates two others
                 earns its corner from nobody.
                 They live directly under the wave panel so the whole run
                 reads off one corner — and self-start keeps the strip its
                 own width rather than the stack's. */
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
                {SPEEDS.map((mult) => (
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
                    className="ms-btn px-3 py-1.5 text-[15px]"
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
        {/* THE MINIMAP, StarCraft-style, in the bottom-left corner: the
            whole map, never zoomed, the field on it and the
            viewport framed (Game.drawMinimap). A press puts that place in
            view and a drag keeps steering. It stands until the run ends —
            the end screens own the frame, and a map under them is noise */}
        {hud && !hud.lost && !hud.won && (
          <div className="ui-zoom absolute bottom-[1rem] left-[1rem] z-10 flex flex-col items-stretch">
            {/* HOW LONG THIS RUN HAS BEEN GOING, on a thin row over the
                map. The clock used to head the top-left panel and went
                with it; it belongs here instead, because the minimap is
                the one part of the HUD a player looks at to ask "where has
                this got to" rather than to make a decision, and the answer
                to that question has a time in it. Simulated seconds
                (UiState.elapsed), so a run at 2x reads the clock the wave
                script is actually keeping rather than the wall's.

                It wears no pane, for the same reason the scrap in the
                opposite corner does not: the two are one number each,
                sitting the same distance above the square below them at
                the same size, and the bottom of the screen reads as a
                pair. A box round one of them breaks that. */}
            <div className="mb-2 text-left text-xl font-bold uppercase tracking-widest tabular-nums text-[#A1A1AA]">
              {clock(hud.elapsed)}
            </div>
            <div className="ms-pane p-1">
              <canvas
                ref={attachMinimap}
                aria-label="minimap"
                className="block h-auto w-[13rem] cursor-pointer [image-rendering:pixelated]"
              />
            </div>
          </div>
        )}
        {/* WHAT IS SELECTED, along the bottom between the two corners
            (components/Inspector.tsx): what it is, what it has left, and
            which attributes it was born with. A click on a turret used to
            draw a range ring and say nothing else, and the attributes a
            placement rolls (mods.ts) are most of what a turret IS.
            It stands only while the run does — the end screens own the
            frame — and it goes with the pause menu, which is the one time
            a panel over the field is in the way of reading the field. */}
        {hud?.inspect && !hud.lost && !hud.won && !hud.menuOpen && (
          <div className="ui-zoom pointer-events-none absolute bottom-[1rem] left-1/2 z-10 -translate-x-1/2">
            <Inspector inspect={hud.inspect} icons={icons} />
          </div>
        )}
        {/* THE BOTTOM-RIGHT CORNER, in ONE column: the run's deal on top
            and the command card under it, both hanging off the same
            anchor. They used to be two absolutely-positioned boxes, the
            deal held off the floor by a hand-written 15rem — which was
            the height of a FOUR-row command card, so the day the card
            grew its fifth row it simply painted over the deal and the
            composition square went off the screen. A flex column cannot
            get that wrong: the card is as tall as it is, and the deal
            sits on top of whatever that comes to. */}
        {hud && !hud.lost && !hud.won && !hud.menuOpen && (
          <div className="ui-zoom absolute bottom-[1rem] right-[1rem] z-10 flex flex-col items-end gap-2">
            {/* THE RUN'S DEAL, StarCraft-style, up the right margin: a
                column of squares growing upward from over the build menu.
                The BOTTOM square is always the family composition — the
                three families the die dealt this map (LevelSpec.families),
                as their first bodies — and every square above it is one
                mutator in force, face and band border. Every cell opens
                the shared hover card (DealFamiliesCell, DealRuleCell)
                saying what it is, so the corner answers itself mid-wave
                rather than sending a player to the codex */}
            {level && (
              <div
                role="list"
                aria-label="families and rules in force"
                className="pointer-events-none flex flex-col-reverse items-end gap-1.5"
              >
                {level.families && level.families.length > 0 && (
                  <DealFamiliesCell families={level.families} />
                )}
                {hudRules.map((def) => (
                  <DealRuleCell key={def.id} def={def} />
                ))}
              </div>
            )}
            {/* THE CORNER IS ONE OF TWO THINGS.

                ON A CHARGED RUN it is THE DEAL (Deal.tsx): a square the
                size of the minimap's, four buttons in it — Buy turret,
                Amount, Buy mods, Buy relics — and the cards the first of
                them throws. A turret is not picked off a shelf any more,
                it is drawn — see rarity.ts for the odds and economy.ts
                for what a draw costs. The square is the minimap's square
                on purpose: the two bottom corners of a StarCraft HUD are
                where you are and what you can do, and they read as a pair.

                ON A FREE BOARD — the sandbox, the editors — it is still
                StarCraft's command card: a fixed 4x4 grid (tech.ts
                BUILD_SLOTS), one building a slot, its key printed on it.
                Nothing is charged there and the whole roster is open, and
                a board that exists to reproduce a bug has to be able to
                reach a NAMED turret, which is the one thing a random deal
                cannot do. Like the minimap, whichever of the two it is
                stands until the run ends: the end screens own the frame. */}
            {/* THE BANK SITS ON THE CARD IT IS SPENT ON. It used to be
                alone in the top-left corner, a screen away from the
                prices it is read against; here it is one line above the
                badges it has to cover, still drawn straight onto the
                screen with no chrome under it — no pane, no border, no
                background, just the number. */}
            {hud.scrap !== null && <ScrapAmount amount={hud.scrap} size="md" className="text-xl" />}
            {hud.dealing ? (
              <DealCorner hud={hud} icons={icons} deal={deal} />
            ) : (
              <div className="ms-pane p-1">
                <div
                  role="group"
                  aria-label="build menu"
                  className="grid w-[13rem] gap-1"
                  style={{ gridTemplateColumns: `repeat(${BUILD_COLS}, minmax(0, 1fr))` }}
                >
                  {BUILD_SLOTS.map((slot, i) => {
                    // A SLOT THE SAVE CANNOT USE IS AN EMPTY SLOT, not a
                    // greyed one: the progress screen answers "what is still
                    // to earn", and the grid answers "what can I put down
                    // right now". A null unlocked list is the sandbox and the
                    // editors — everything in the grid is theirs
                    const kind =
                      slot && (!hud.unlocked || hud.unlocked.includes(slot.kind)) ? slot.kind : null;
                    if (!slot || !kind)
                      return (
                        <div
                          key={i}
                          aria-hidden="true"
                          className="aspect-square w-full border border-[#26262b] bg-[#101013]"
                        />
                      );
                    const entry = MENU_BY_KIND.get(kind)!;
                    // what the badge says is the PRICE, in scrap — the number
                    // a build decision is made against — and it reddens the
                    // moment the run cannot cover it. Free builds (sandbox,
                    // the editors) carry no number at all
                    const price = hud.scrap === null ? null : hud.prices[kind];
                    return (
                      <BuildCell
                        key={i}
                        slot={slot}
                        icon={icons[kind] ?? entry.icon}
                        name={entry.name}
                        price={price}
                        targeting={hud.targeting[kind]}
                        poor={price !== null && hud.scrap !== null && hud.scrap < price}
                        picked={hud.buildKind === kind}
                        onPick={() => pickTower(kind)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        {hud?.lost && (
          <div className="ms-screen absolute inset-0 flex items-center justify-center">
            <div className="ui-zoom ms-pane-solid w-80 max-w-[calc(100vw-2rem)] border-[#6b2a2a] p-6 text-center">
              <div className="font-display text-xl font-bold uppercase tracking-widest text-[#e55454]">
                Core destroyed
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
                {result && (
                  <div>
                    Waves cleared{" "}
                    <span className="font-bold text-[#EDEDEF]">{result.wavesCleared}</span>
                    {hud.mission.kind === "survive" ? null : <> of {result.totalWaves}</>}
                  </div>
                )}
                {result && result.xp > 0 && (
                  <div className="space-y-1 pt-1">
                    {/* the waves are the objectives, so a loss still pays
                        for every wave the board cleared on the way down —
                        which is what makes a failed push into progress */}
                    <div>Earned (×{result.xpBonus.toFixed(2)})</div>
                    <XpAmount amount={result.xp} className="justify-center" />
                    <LevelUpLine result={result} />
                  </div>
                )}
              </div>
              <div className="mt-6 space-y-3">
                {/* the salvage above is spendable RIGHT NOW, and spending it
                    is the only thing that changes the next attempt — so the
                    tree leads, and the way out sits under it.
                    THERE IS NO RETRY. A lost run is not stood back up on the
                    spot: the next attempt is deployed from the menu like any
                    other, with the map, the difficulty and the families all
                    asked for again — which is the choice a loss is supposed
                    to send the player back to make */}
                <button
                  onClick={() => {
                    setTechFrom("game");
                    setScreen("tech");
                  }}
                  className="ms-btn ms-btn-accent w-full px-5 py-2 text-base"
                >
                  Progress
                </button>
                <button
                  onClick={backToMenu}
                  className="ms-btn w-full px-5 py-2 text-base"
                >
                  Menu
                </button>
              </div>
            </div>
          </div>
        )}
        {hud?.won && !hud.lost && (
          <div className="ms-screen absolute inset-0 flex items-center justify-center">
            <div className="ui-zoom ms-pane-solid w-80 max-w-[calc(100vw-2rem)] border-[#2f5a3a] p-6 text-center">
              <div className="font-display text-xl font-bold uppercase tracking-widest text-[#7BE58A]">
                {hud.mission.kind === "survive" ? "Survived" : "Line held"}
              </div>
              <div className="mt-1 text-[14px] uppercase tracking-widest text-[#71717C]">
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
        {/* SETTINGS, MID-RUN — the front of house's own screen, raised over
            the field. It is a SCREEN and not a card inside the pause sheet,
            which is what it used to be: the sheet is 30rem wide because a
            column of three buttons wants to be, and the settings panel
            squeezed into what was left of it after the sheet's own padding
            came off had its knobs wrapping under their labels and its tab
            strip on two lines. Same column as the menu (MENU_COLUMN), same
            corner back button, same panel — the only difference is the
            ground behind it, which is the run, held where it was.

            The whole panel is here rather than the two knobs a run needs,
            because the moment a phone needs the effects switch is mid-run,
            when the framerate dips — and the same goes for the health bars
            the fight in front of the player is or is not wearing. */}
        {hud?.menuOpen && !hud.lost && !hud.won && pauseSettings && (
          <div className="absolute inset-0 z-30 overflow-y-auto bg-[#0b0b0d]/95">
            <div className={`${MENU_COLUMN} ${MENU_COLUMN_PAD}`}>{settingsBody(true)}</div>
            <CornerBack label="Back" onClick={() => setPauseSettings(false)} />
          </div>
        )}
        {/* THE PAUSE SHEET. Opening it holds the sim (Game.openMenu), so
            its heading says what the run is doing */}
        {hud?.menuOpen && !hud.lost && !hud.won && !pauseSettings && (
          <div className="ms-screen absolute inset-0 flex items-center justify-center">
            <div className="ui-zoom ms-pane flex max-h-[calc(100vh-2rem)] w-[30rem] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 overflow-y-auto p-6">
              {/* the sandbox door is Ctrl+Shift+S; the row below says when
                  it is open, and is also what closes it */}
              <h2 className="ms-strip -mx-6 -mt-6 mb-1 self-stretch font-display text-lg font-bold uppercase text-[#FFD37F]">
                Paused
              </h2>
              {admin && (
                <div className="ms-pane flex w-full max-w-[20rem] items-center justify-between gap-3 border-[#6b4f8a] px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold uppercase tracking-widest text-[#C9A7FF]">
                      Sandbox
                    </div>
                    <div className="text-[14px] text-[#71717C]">
                      Every turret and pace — this run only
                    </div>
                  </div>
                  <button
                    onClick={() => setAdmin(false)}
                    className="ms-btn ms-btn-tint shrink-0 px-3 py-1.5 text-[15px]"
                    style={{ "--ms-tint": "#c9a7ff" } as CSSProperties}
                  >
                    Off
                  </button>
                </div>
              )}
              {/* THE MENU. Settings is one press deep and opens as its own
                  screen over the field (above); the press back out is the
                  corner back button, where every other screen keeps it */}
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
                    alone, in the colour nothing else on the panel wears —
                    and asks, in the game's own dialog, before it throws
                    the run away */}
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Abandon this run",
                      body: "You will lose all xp from this game.",
                      confirmLabel: "Abandon",
                      cancelLabel: "Keep playing",
                    });
                    if (ok) backToMenu();
                  }}
                  className="ms-btn ms-btn-red w-full px-5 py-2 text-base"
                >
                  Abandon run
                </button>
              </div>
            </div>
          </div>
        )}
        {/* the same one dialog the front of house uses, over the field */}
        {confirmDialog}
      </div>
    </div>
  );
}
