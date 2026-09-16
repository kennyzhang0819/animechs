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
import { profileLines } from "@/game/simreport";
import { usePathname, useRouter } from "next/navigation";
import GameConsole from "./Console";
import {
  BOOT_STEP_LABEL,
  BOOT_STEPS,
  firstLoadStep,
  Game,
  LOAD_STEP_LABEL,
  LOAD_STEPS,
  type BootStep,
  type LoadStep,
  type UiState,
} from "@/game/game";
import { loadBalanceDoc } from "@/game/balance";
import {
  ACTIVE_FAMILIES,
  FAMILIES,
  FAMILIES_MAX,
  FAMILIES_PER_RUN,
  MAX_FAMILIES_PER_WAVE,
  FAMILY_ACCENT,
  familyByKey,
  familyFlies,
  loadLevelDocs,
  missionText,
  rollFamilies,
  transformScript,
  unitName,
  unitRank,
  waveGroups,
  WORLD,
  worldById,
  WORLDS,
  type FamilyKey,
  type LevelSpec,
  type TowerKind,
  type UnitKind,
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
  tierBossHpScale,
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
  saveShowFps,
  saveUiScale,
  savePanSpeed,
  saveInvertZoom,
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
  INVERT_ZOOM_DEFAULT,
  UI_SCALE_DEFAULT,
  UI_SCALES,
  saveRunPick,
  techOf,
  worldLock,
  GAME_MODE_DEFAULT,
  type GameMode,
  type Progress,
  type RunReward,
} from "@/game/progress";
import { atlasReady, buildAtlas, towerIcon } from "@/game/atlas";
import {
  cleanMutations,
  mutationById,
  mutationCost,
  mutationCostOf,
  mutationsInForce,
  MUTATIONS,
  MUT_COST_MAX,
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
import { TOWER_KINDS, type RGB } from "@/game/types";
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
import { BLANK_ICON, carveUnitIcon, unitIconOf } from "./unitIcons";
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
  /** custom mode's named families; empty (regular mode's always) is rolled */
  hand: readonly FamilyKey[] = [],
): LevelSpec => {
  const spec = specForTier(world, tier);
  // THE DIE IS ROLLED HERE, against the script it is about to be dealt
  // into, because the roll is not free of it: a flying family may not take
  // a slot the OPENING WAVE sends (levels.ts rollFamilies), and which
  // slots those are is a property of this tier's expanded script. Rolling
  // outside and passing the result in let a caller hand over a deal that
  // opens wave 1 with runts, which is an opening with one legal answer.
  // A custom hand goes through the same call and is dealt under the same
  // rule — what it changes is which families are in the pile, never how
  // they are laid into the slots.
  const families = rollFamilies(Math.random, spec.script, hand);
  return {
    ...spec,
    script: transformScript(spec.script, families),
    families,
    ...(mutation.length > 0 ? { mutation } : null),
  };
};


/**
 * A MACRO — one dial on the deploy screen, printed as a row: what it is
 * on the left, what it is set to on the right, and the whole row a
 * button that opens the list to change it. The value is what a player
 * reads at a glance ("Nemesis +2 · 140% XP", "1 named · 2 rolled"), so
 * it gets the ink and the label sits small beside it.
 *
 * Regular mode shows ONE of these (the difficulty) and custom four —
 * see the deploy screen for why a mode's non-picks are absent rather
 * than dimmed.
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
      <span className="shrink-0 text-[13px] text-[#a2a2a2]">{label}</span>
      {/* the value gives way before the row does: a setting whose name
          runs long ellipsizes rather than pushing the chevron off the
          card, which is what a long faction hand used to do */}
      <span className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap text-[16px] tracking-[0.12em]">
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
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  /** the rows, left */
  list: ReactNode;
  /** what the cursor is on, right */
  detail: ReactNode;
  /**
   * A BAR UNDER BOTH PANES, and only the MULTI-PICKERS have one. A list
   * that takes one answer closes on Select, so the way out is the answer;
   * a list that takes several (the factions, the mutators) stays open
   * while the hand is built, and a dialog with no visible way out is one
   * a player has to guess Escape at. So those carry a Done button here.
   */
  footer?: ReactNode;
  /**
   * HOW WIDE THE ROWS ARE, and the whole of why it is a knob: a row is
   * ONE LINE and a truncated one is a row a player cannot read. The map
   * and difficulty lists hold short proper nouns and fit the default;
   * the factions and the mutators run to two words ("Harpoon fleet",
   * "Armored Swarms") that need the wider column, and the dialog widens
   * with them so the detail pane does not pay for it.
   */
  wide?: boolean;
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
        className={`ui-zoom ms-pane-solid flex max-h-[calc(100vh-2rem)] w-full flex-col p-4 ${
          wide ? "max-w-[46rem]" : "max-w-[38rem]"
        }`}
      >
        <h2 className="ms-heading ms-strip -mx-4 -mt-4 mb-3 text-[14px]">{title}</h2>
        <div className="flex min-h-0 gap-3">
          <div
            role="listbox"
            className={`flex shrink-0 flex-col gap-1.5 overflow-y-auto ${
              wide ? "w-[17rem]" : "w-[12rem]"
            }`}
          >
            {list}
          </div>
          <div className="ms-pane-solid flex min-h-[16rem] min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {detail}
          </div>
        </div>
        {footer && <div className="mt-3">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * The one button on a detail pane: take what the cursor is on. Its label
 * is "Select" wherever the list takes one answer; the multi-pickers pass
 * their own ("Add", "Remove", "Roll them"), because on a list a player is
 * building a hand out of, "Select" says nothing about which way the press
 * moves the thing under the cursor.
 */
function SelectButton({
  onClick,
  disabled = false,
  label = "Select",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ms-btn ms-btn-accent mt-auto w-full py-2.5 text-[15px]"
    >
      {label}
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

/**
 * THE INTERCEPT MISSION'S OBJECTIVE PANEL (levels.ts InterceptMission) —
 * three numbers and a sentence, top-left under the shelf.
 *
 * IT COUNTS UP AND IT COUNTS DOWN AT THE SAME TIME, because both halves
 * are the state: the kills are the progress and the leaks are the
 * allowance, and a player who can see one without the other cannot tell
 * whether the run is going well. The allowance is drawn as pips rather
 * than a fraction for the same reason the wave progress is a bar — "0/1"
 * is a number to work out and two pips is a thing to look at.
 *
 * THE LIVE COUNT IS THE THIRD LINE and only shows while something is on
 * the board, because that is the only moment it means anything: "two on
 * the line" is a sentence about a decision to make in the next minute,
 * and a nought sitting there the rest of the time is just noise.
 */
function ObjectivePane({ hud }: { hud: UiState }): React.ReactElement | null {
  const m = hud.mission;
  if (m.kind !== "intercept") return null;
  const done = Math.min(m.kills, hud.crossKilled);
  const spent = Math.min(m.leaks + 1, hud.crossLeaked);
  return (
    <div className="ms-pane px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[15px] font-bold uppercase tracking-widest text-[#EDEDEF]">
          {done} / {m.kills}
        </span>
        <span className="text-[13px] uppercase tracking-widest text-[#A6A6AF]">destroyed</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[13px] uppercase tracking-widest text-[#71717C]">past you</span>
          {/* one pip per leak the run is allowed, plus the one that ends
              it — a lit pip is a leak already spent */}
          {Array.from({ length: m.leaks + 1 }, (_, i) => (
            <span
              key={i}
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                i < spent ? "bg-[#e55454]" : "bg-[#3a3a42]"
              }`}
            />
          ))}
        </span>
      </div>
      {hud.crossLive > 0 && (
        <div className="mt-0.5 text-[13px] text-[#A6A6AF]">
          {hud.crossLive === 1 ? "One is crossing now" : `${hud.crossLive} are crossing now`}
        </div>
      )}
    </div>
  );
}

/** a rung's multiplier as its share of the mission pot: Incursion prints
 *  "40% XP", Nemesis — the rung the pot is priced for — "100% XP", the
 *  top rung "220% XP" */
const xpShareText = (mult: number): string => `${Math.round(mult * 100)}% XP`;

/**
 * THE MAP LIST — CUSTOM MODE'S ONLY (GameMode). Regular rolls its map on
 * Start and never opens this: a run's map is the campaign's to deal, and
 * it is the default there because it is the best way to play the
 * campaign, not because it is bribed.
 *
 * Random leads and is the default here too. Under it, every world by
 * name, one line each — and every one of them is PLAYABLE, the track's
 * locks included, because a custom run pays nothing for reaching a map
 * early (see the note in the body). THE PICTURE IS ON THE RIGHT AND ONLY
 * AFTER A CLICK: the list is names, the cursor starts on Random, and a
 * row click puts that map's thumbnail, mission and standing beside it.
 * No map is ranked against another: every map is as hard as the
 * difficulty it is played at, and the difficulty is another macro.
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
  // THE LIST IS ONLY EVER OPENED IN CUSTOM MODE, where the track's locks
  // do not apply (GameMode): a custom run pays nothing, so there is
  // nothing for an unopened map to be a shortcut to. Regular mode never
  // opens it at all — its map is rolled on Start. What the lock still
  // does is DESCRIBE: the detail pane says which level would have opened
  // a map the campaign has not reached, because that is worth knowing
  // even where it is not a gate.
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
      {WORLDS.map((w) => (
        <PickRow
          key={w.id}
          selected={pick === w.id}
          focused={focus === w.id}
          onPick={() => setFocus(w.id)}
        >
          <span className={`${rowText} text-[#EDEDEF]`}>{w.name}</span>
        </PickRow>
      ))}
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
        <p className="text-[14px] text-[#A6A6AF]">Any map, picked on start.</p>
        <SelectButton onClick={() => onPick(null)} />
      </>
    );
  } else {
    const mission = missionText(world);
    detail = (
      <>
        <div className="w-full">
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
        <DetailLine label="Best">
          {best > 0 ? (
            <span style={{ color: rungColor(best - 1) }}>{rungLabel(best - 1)}</span>
          ) : (
            "New"
          )}
        </DetailLine>
        {/* a map the campaign has not reached is still playable here — the
            line says what regular mode is still holding it behind */}
        {lock && (
          <DetailLine label="Campaign opens at">
            <span style={{ color: POINT_COLOR }}>level {lock.level}</span>
          </DetailLine>
        )}
        <SelectButton onClick={() => onPick(world.id)} />
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
 * script at full count is always playable. IN CUSTOM MODE NOTHING IS
 * SHUT (see `custom`): the draw there is the whole catalog or the
 * player's own list, so the promise is good at any level.
 *
 * A SHUT ROW IS GREYED IN THE LIST AND NAMES ITS LEVEL IN THE DETAIL —
 * a row a player cannot click is a question, and the answer costs one
 * line beside the thing they are already looking at. The list itself
 * stays wordless, so nine greyed names do not become nine copies of the
 * same sentence.
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
  custom,
  onPick,
  onClose,
}: {
  tier: number;
  /** the picked map, for a body count — null when the run is on Random */
  world: LevelSpec | null;
  /** the level the save PLAYS at — what decides which rows are shut */
  level: number;
  /**
   * CUSTOM MODE OPENS THE WHOLE LADDER (GameMode). The gate above exists
   * so that a difficulty promising three mutators can actually draw
   * three — and in custom mode the draw is the whole catalog, or the
   * player's own list, so the promise is good at every level. The run
   * pays nothing either way, so there is nothing to shortcut to.
   */
  custom: boolean;
  onPick: (tier: number) => void;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState(tier);
  const scale = tierCountScale(focus);
  const rules = tierMutationCount(focus);
  const step = tierMutationStep(focus);
  const swarm = world ? budget(world, focus) : null;
  const open = custom || difficultyOpen(level, rules);

  const list = Array.from({ length: RUNG_COUNT }, (_, t) => {
    const shut = !custom && !difficultyOpen(level, tierMutationCount(t));
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
          ? `${SWARM_SIZE[SWARM_SIZE.length - 1]}, under ${rules} mutator${rules === 1 ? "" : "s"}${
              custom ? " — rolled, or yours to name." : " rolled when the run starts."
            }`
          : `${SWARM_SIZE[Math.min(focus, SWARM_SIZE.length - 1)]}. No mutators.`}
      </p>
      <DetailLine label="Swarm">
        {Math.round(scale * 100)}%
        {swarm ? ` · ${swarm.units.toLocaleString()} units over ${swarm.waves} waves` : ""}
      </DetailLine>
      <DetailLine label="Mutators">{rules === 0 ? "None" : `${rules} rules`}</DetailLine>
      {custom ? (
        <DetailLine label="Pays">
          <span className="text-[#71717C]">No XP</span>
        </DetailLine>
      ) : open ? (
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
 * THE DONE BAR under a multi-picker (PickerDialog's `footer`): what is in
 * the hand so far on the left, the way out on the right. Nothing is
 * "applied" by it — every toggle has already been taken and remembered —
 * so it closes and nothing else.
 */
function PickerDone({ summary, onClose }: { summary: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-[14px] uppercase tracking-widest text-[#71717C]">
        {summary}
      </span>
      <button onClick={onClose} className="ms-btn ms-btn-accent shrink-0 px-6 py-2 text-[15px]">
        Done
      </button>
    </div>
  );
}

/**
 * THE FACTION LIST — custom mode's, and the only place in the game where
 * the swarm is NAMED rather than rolled.
 *
 * A run's families are dealt into the script's slots a wave at a time
 * (levels.ts rollFamilies, transformScript), and this names them.
 *
 * WHAT IS NAMED IS WHAT IS SENT — the whole list, not a seed. Tick three
 * and the run sends those three; tick ONE and every wave of the campaign
 * arrives in that one family, which is the way to sit down and find out
 * what a single line actually does. A hand used to be topped up to
 * FAMILIES_PER_RUN by the roll, which made this picker a liar: ticking
 * the Wraiths to go and look at the Wraiths got you the Wraiths and three
 * strangers, and a single-family run could not be asked for at all.
 *
 * AN EMPTY HAND IS NOT A HAND OF ZERO. The Random row at the top is not a
 * choice sitting alongside the families — it is the ABSENCE of a hand,
 * means rolled, and pressing it clears. So the floor on a named hand is
 * one and the way back to none is the row that says so.
 *
 * THE CEILING IS FAMILIES_MAX or the roster, whichever bites first — a
 * hand cannot name a family that does not exist, so with seven fielded
 * the list fills at seven. A FULL HAND STOPS TAKING MORE rather than
 * pushing the oldest out: a silent swap in a list this long is a hand a
 * player cannot keep track of, so the button says it is full and the way
 * to change it is to drop one.
 */
function FactionPicker({
  picked,
  onSet,
  onClose,
}: {
  picked: readonly FamilyKey[];
  onSet: (families: readonly FamilyKey[]) => void;
  onClose: () => void;
}) {
  // the cursor starts on Random, which is the row that describes what an
  // untouched custom run does — so the right pane means something from
  // the first frame whether or not a hand has been built yet
  const [focus, setFocus] = useState<FamilyKey | null>(null);
  const family = focus == null ? null : familyByKey(focus);
  const on = focus != null && picked.includes(focus);

  // the families a hand may actually name: the table less the shelf
  // (levels.ts SHELVED_FAMILIES, which cleanFamilies enforces anyway — a
  // row here for a family the roller will not deal is a row that does
  // nothing when it is ticked)
  const offered = FAMILIES.filter((f) => ACTIVE_FAMILIES.includes(f.key));
  // ...and the ceiling is whichever runs out first, the rule or the roster
  const cap = Math.min(FAMILIES_MAX, offered.length);
  const full = picked.length >= cap;

  const rowText = "truncate font-display text-[15px] font-bold uppercase tracking-widest";
  const list = (
    <>
      <PickRow selected={picked.length === 0} focused={focus === null} onPick={() => setFocus(null)}>
        <span className={`${rowText} text-[#EDEDEF]`}>Random</span>
      </PickRow>
      {offered.map((f) => (
        <PickRow
          key={f.key}
          selected={picked.includes(f.key)}
          focused={focus === f.key}
          onPick={() => setFocus(f.key)}
        >
          <span className={rowText} style={{ color: rgbHex(FAMILY_ACCENT[f.key]) }}>
            {f.name}
          </span>
        </PickRow>
      ))}
    </>
  );

  const detail =
    family == null ? (
      <>
        <div className="font-display text-[17px] font-bold uppercase tracking-widest text-[#EDEDEF]">
          Random
        </div>
        <p className="text-[14px] text-[#A6A6AF]">
          {FAMILIES_PER_RUN} of the {offered.length} factions are picked at random each run,
          up to {MAX_FAMILIES_PER_WAVE} of them per wave — or pick{" "}
          {cap === 1 ? "one" : `1 to ${cap}`} yourself.
        </p>
        <SelectButton
          label="Roll them all"
          disabled={picked.length === 0}
          onClick={() => onSet([])}
        />
      </>
    ) : (
      <>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- raw pixel sprite, no optimization wanted */}
          <img
            src={unitIconOf(family.icon) ?? BLANK_ICON}
            alt=""
            className="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]"
          />
          <div
            className="font-display text-[17px] font-bold uppercase tracking-widest"
            style={{ color: rgbHex(FAMILY_ACCENT[family.key]) }}
          >
            {family.name}
          </div>
        </div>
        <DetailLine label="Comes in by">
          {familyFlies(family.key) ? "air" : family.layer === "water" ? "water" : "ground"}
        </DetailLine>
        {/* the five bodies in tier order — a family IS one idea at five
            sizes (see FAMILIES), and a body is named for its family and
            how far up it stands (levels.ts UNIT_NAMES). The family's own
            name is the line above, so these are the RANKS alone: five
            rows of "Ironhide" under a heading reading IRONHIDES is the
            same word six times. */}
        <p className="text-[14px] leading-snug text-[#A6A6AF]">
          {family.kinds.map(unitRank).join(" · ")}
        </p>
        <SelectButton
          label={on ? "Remove" : full ? `Hand is full — ${cap}` : "Add"}
          disabled={!on && full}
          onClick={() =>
            onSet(on ? picked.filter((k) => k !== focus) : [...picked, focus as FamilyKey])
          }
        />
      </>
    );

  return (
    <PickerDialog
      title="Enemy factions"
      wide
      onClose={onClose}
      list={list}
      detail={detail}
      footer={
        <PickerDone
          summary={
            picked.length === 0
              ? `All ${FAMILIES_PER_RUN} rolled`
              : picked.length === 1
                ? "1 named — every wave"
                : `${picked.length} named`
          }
          onClose={onClose}
        />
      }
    />
  );
}

/**
 * A family's accent as a CSS colour. The palette keeps every colour as an
 * 0-1 triple because that is what the GL renderer wants (constants.ts
 * `pal`), and this is the one screen that has to hand one to the DOM.
 */
const rgbHex = (c: RGB): string => {
  const ch = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(c[0])}${ch(c[1])}${ch(c[2])}`;
};

/**
 * THE MUTATOR LIST — custom mode's, and only reachable where the picked
 * difficulty rolls rules at all (tierMutationCount): under Nemesis +1 the
 * campaign is the script as authored, and a run with rules ticked on at
 * Incursion would be a difficulty the ladder has never priced.
 *
 * AN EMPTY LIST MEANS ROLLED, exactly as the faction picker's does — the
 * difficulty's own roll, over the WHOLE catalog rather than the deck the
 * track has opened, because custom mode is not the campaign and pays
 * nothing. Tick anything and the run is played under precisely that,
 * however many and however dear: this is the door the old admin sandbox
 * was, and its whole purpose is to be able to LOOK at a rule — to see
 * what Volatile does to a cleaver wall without re-rolling a Nemesis deploy
 * until it turns up.
 *
 * THE DIFFICULTY'S OWN BUDGET IS PRINTED BESIDE THE TICKED TOTAL and is
 * ADVISORY. Exceeding it is allowed and is often the point; what the
 * number buys is calibration — "four points past anything Nemesis +2
 * would roll" is the difference between a fair test and a misleading one.
 */
function MutatorPicker({
  picked,
  tier,
  onSet,
  onClose,
}: {
  picked: readonly MutationId[];
  /** the rung the run is set to — its budget and count are what this is read against */
  tier: number;
  onSet: (ids: readonly MutationId[]) => void;
  onClose: () => void;
}) {
  const [focus, setFocus] = useState<MutationId | null>(null);
  const def = focus == null ? null : mutationById(focus);
  const on = focus != null && picked.includes(focus);
  const spent = mutationCost(picked);
  const budgetPts = tierMutationPoints(tier);
  const rolls = tierMutationCount(tier);

  const rowText = "truncate font-display text-[15px] font-bold uppercase tracking-widest";
  const list = (
    <>
      <PickRow selected={picked.length === 0} focused={focus === null} onPick={() => setFocus(null)}>
        <span className={`${rowText} text-[#EDEDEF]`}>Random</span>
      </PickRow>
      {MUTATIONS.map((m) => {
        const band = bandFor(m);
        return (
          <PickRow
            key={m.id}
            selected={picked.includes(m.id)}
            focused={focus === m.id}
            onPick={() => setFocus(m.id)}
          >
            <span className={rowText} style={{ color: band.color }}>
              {m.name}
            </span>
            <span className="ml-auto shrink-0 text-[13px] tracking-widest text-[#71717C]">
              {mutationCostOf(m.id)}
            </span>
          </PickRow>
        );
      })}
    </>
  );

  const detail =
    def == null ? (
      <>
        <div className="font-display text-[17px] font-bold uppercase tracking-widest text-[#EDEDEF]">
          Random
        </div>
        <p className="text-[14px] text-[#A6A6AF]">
          {rungLabel(tier)} rolls {rolls} rule{rolls === 1 ? "" : "s"} from the whole catalog
          when the run starts, for {budgetPts} points.
        </p>
        <SelectButton
          label="Roll them all"
          disabled={picked.length === 0}
          onClick={() => onSet([])}
        />
      </>
    ) : (
      <>
        <div className="flex items-center gap-3">
          <MutationFace id={def.id} size="h-10 w-10" />
          <div
            className="font-display text-[17px] font-bold uppercase tracking-widest"
            style={{ color: bandFor(def).color }}
          >
            {def.name}
          </div>
        </div>
        <DetailLine label="Weight">
          {mutationCostOf(def.id)} / {MUT_COST_MAX} points · {bandFor(def).label}
        </DetailLine>
        <p className="text-[14px] leading-snug text-[#A6A6AF]">{def.blurb}</p>
        <SelectButton
          label={on ? "Remove" : "Add"}
          onClick={() =>
            onSet(
              on
                ? picked.filter((id) => id !== focus)
                : cleanMutations([...picked, focus as MutationId]),
            )
          }
        />
      </>
    );

  return (
    <PickerDialog
      title="Mutators"
      wide
      onClose={onClose}
      list={list}
      detail={detail}
      footer={
        <PickerDone
          summary={
            picked.length === 0
              ? `${rolls} rolled for ${budgetPts} points`
              : `${picked.length} named · ${spent} pts${spent > budgetPts ? ` — over ${rungLabel(tier)}'s ${budgetPts}` : ""}`
          }
          onClose={onClose}
        />
      }
    />
  );
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
 * THE FAMILY PICTURES, one per family: its T1, carved off the PACKED SHEET
 * rather than loaded from /mindustry/sprites/units
 * (components/unitIcons.ts, atlas.ts unitIcon).
 *
 * The raw sprite file is not the body the game draws, and for most of the
 * seven families there is no file at all — the rhinos, frogs, stags and
 * bats are generated at load (game/animalArt.ts) and packed over the
 * stock cells, and the elephants have no upstream hull behind them at
 * all — so a thumbnail off public/mindustry showed a picture of
 * upstream's unit, or nothing: wrong animal, wrong edges, and
 * Mindustry's crux red where the hue that tells a player which family
 * this is belongs.
 *
 * Built ONCE per page and shared with every other panel that wants a
 * body's portrait, and primed by the boot warm-up so the squares are not
 * empty on the first wave. A failure leaves the cache short an entry and
 * the cell falls back to the sprite file.
 */
const buildFamilyIcons = (): Promise<void> =>
  Promise.all(FAMILIES.map((f) => carveUnitIcon(f.icon))).then(() => undefined);


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
      {/* THE PICTURES SHRINK TO FIT, because the hand does not have a
          fixed size any more (levels.ts FAMILIES_MAX): the die deals four
          and custom mode may name up to ten. The square is 48px with 4px
          of padding, so 40px of room and a 2px gap — which takes two 16px
          pictures a row, three 12px, or four 8px. Picking the step off
          the COUNT keeps every hand inside the same square rather than
          letting a big one push the mutators up the margin. */}
      {families.map((f) => (
        <img
          key={f}
          src={unitIconOf(familyByKey(f).icon) ?? BLANK_ICON}
          alt=""
          className={`${
            families.length <= 4 ? "h-4 w-4" : families.length <= 9 ? "h-3 w-3" : "h-2 w-2"
          } object-contain [image-rendering:pixelated]`}
        />
      ))}
      <HoverCard tip={tip} title="Swarm families" tag="Deal" color={DEAL_COLOR} align="right">
        {families.length === 1 ? (
          <>The only faction this run sends.</>
        ) : (
          <>
            The {families.length} factions this run sends, up to {MAX_FAMILIES_PER_WAVE} of
            them per wave.
          </>
        )}
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

/** every kind's picture as the sheet draws it (atlas.ts towerIcon) */
const carveTowerIcons = (): Promise<(readonly [TowerKind, string])[]> =>
  Promise.all(TOWER_MENU.map(async (t) => [t.kind, await towerIcon(t.kind)] as const)).catch(
    () => [] as (readonly [TowerKind, string])[],
  );

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
  settleOnRelease = false,
}: {
  label: string;
  steps: readonly number[];
  value: number;
  onPick: (v: number) => void;
  /**
   * FOR THE ONE SLIDER THAT MOVES ITSELF. UI size is set from inside a
   * `.ui-zoom` panel, so applying it mid-drag resizes the slider under the
   * pointer — and a range input reads the pointer against its own box, so
   * the new box gives a new value, which gives a new box. That is a
   * feedback loop, and it shows as the panel flickering between two sizes
   * and the knob refusing to be put anywhere.
   *
   * The cure is to let the knob be dragged without the value following it:
   * the track and the percentage move live, the game is set once, when the
   * button comes up. The arrow keys still step it one at a time and settle
   * on each press — a key press is not measured against the box, so there
   * is nothing there to loop.
   *
   * Every other slider sets something the panel's own layout does not
   * depend on (pan speed), and those stay live.
   */
  settleOnRelease?: boolean;
}) {
  const at = Math.max(0, steps.indexOf(value));
  const text = (v: number): string => `${Math.round(v * 100)}%`;
  const rowRef = useRef<HTMLDivElement>(null);
  /** where the knob has been dragged to, while the value is still `at` */
  const [held, setHeld] = useState<number | null>(null);
  const heldRef = useRef<number | null>(null);
  /** the drag's window listeners, so an unmount mid-drag does not leak them */
  const dropRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dropRef.current?.(), []);
  const shown = held ?? at;

  /**
   * SET IT, AND KEEP THE ROW WHERE THE HAND LEFT IT. A bigger HUD is a
   * taller panel, and the rows above this one grow with it, so the slider
   * itself slides down the screen and out from under the cursor — which
   * makes a second nudge a hunt. Measure the row, let the new size land,
   * and scroll by the difference.
   */
  const settle = (i: number): void => {
    if (steps[i] === value) return;
    const before = rowRef.current?.getBoundingClientRect().top ?? null;
    onPick(steps[i]);
    if (before === null) return;
    requestAnimationFrame(() => {
      const after = rowRef.current?.getBoundingClientRect().top;
      if (after === undefined) return;
      const drift = after - before;
      if (Math.abs(drift) < 1) return;
      let el: HTMLElement | null = rowRef.current;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
          el.scrollTop += drift;
          return;
        }
        el = el.parentElement;
      }
      window.scrollBy(0, drift);
    });
  };

  const grab = (): void => {
    if (!settleOnRelease) return;
    const release = (): void => {
      dropRef.current?.();
      const i = heldRef.current;
      heldRef.current = null;
      setHeld(null);
      if (i !== null) settle(i);
    };
    const drop = (): void => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      dropRef.current = null;
    };
    dropRef.current = drop;
    // on the window, not the input: a drag that ends off the knob is still
    // the end of the drag, and not every browser captures the pointer
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    heldRef.current = at;
    setHeld(at);
  };

  return (
    <SettingRow label={label}>
      <div ref={rowRef} className="flex shrink-0 items-center gap-3">
        <input
          type="range"
          className="ms-slider w-40"
          min={0}
          max={steps.length - 1}
          step={1}
          value={shown}
          aria-label={label}
          aria-valuetext={text(steps[shown])}
          onPointerDown={grab}
          onChange={(e) => {
            const i = Number(e.target.value);
            if (dropRef.current) {
              heldRef.current = i;
              setHeld(i);
            } else {
              settle(i);
            }
          }}
        />
        <div className="w-12 text-right text-[15px] font-bold tabular-nums text-[#EDEDEF]">
          {text(steps[shown])}
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

export default function Animechs() {
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
  // the in-game console's way to the admin page (Console.tsx; the same
  // route AdminShortcut's key takes)
  const router = useRouter();
  const pathname = usePathname();
  /**
   * WHERE IN THE FRONT-OF-HOUSE THE PLAYER IS. The menu screen is three
   * panels, not one: a title card, settings, and the DEPLOY screen behind
   * Start — the mode, the macros that mode offers, and the button that
   * starts it. Each macro opens its list as a dialog over the deploy
   * screen (`picker`), so choosing a run never leaves the screen it is
   * started from.
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
  const [picker, setPicker] = useState<"maps" | "difficulty" | "factions" | "mutators" | null>(
    null,
  );
  const [level, setLevel] = useState<LevelSpec | null>(null);
  /**
   * The difficulty macro: the rung the next run is played at. Every rung
   * is open from the first run; this is the save's remembered pick
   * (Progress.difficulty), Incursion on a fresh save.
   */
  const [tier, setTier] = useState(0);
  /**
   * WHICH OF THE TWO MODES THE DEPLOY SCREEN IS ON (progress.ts GameMode).
   * Regular is the campaign — one pick, the difficulty, and the map, the
   * swarm and the rules all rolled — and it is the only mode that pays
   * XP. Custom hands every dial over and pays nothing.
   *
   * IT IS THE FIRST THING ON THE DEPLOY SCREEN because it decides what
   * else is on it: the three macros below the difficulty are custom's
   * alone, and in regular mode they are not dimmed, they are simply not
   * there — a row that says "Random, and you cannot change it" is a row
   * about nothing.
   */
  const [mode, setMode] = useState<GameMode>(GAME_MODE_DEFAULT);
  /**
   * The map macro: a world id, or null for RANDOM. CUSTOM MODE'S ONLY —
   * a regular deploy rolls its map on Start and never reads this, which
   * is why a map picked in custom survives a regular run. Resolved
   * through worldById so a stale id reads as Random rather than as a
   * world that is not there.
   */
  const [mapPick, setMapPick] = useState<string | null>(null);
  const pickedWorld = mapPick == null ? null : worldById(mapPick);
  /**
   * CUSTOM MODE'S HAND: the families named for the swarm and the rules
   * named for the run, both EMPTY meaning rolled and both ignored
   * outright in regular mode. Kept as two lists rather than folded into
   * one "custom setup" object because they are picked, saved and read
   * one at a time.
   */
  const [families, setFamilies] = useState<readonly FamilyKey[]>([]);
  const [mutators, setMutators] = useState<readonly MutationId[]>([]);
  /**
   * WHAT THE TWO CUSTOM MACROS SAY ON THEIR FACE. A macro row is ONE
   * LINE the width of the card, so what they report is a COUNT — a
   * family name is two words and even one of them alongside "2 rolled"
   * is wider than the row has. The one exception is a single mutator,
   * whose name fits and is the thing worth knowing at a glance.
   *
   * NOTHING IS ROLLED ALONGSIDE A HAND any more (levels.ts rollFamilies):
   * a named hand is the whole list, so the row says how many were named
   * and stops. It used to print the remainder the die was still filling
   * in, which no longer exists. Which families are in the hand is the
   * list's to say.
   */
  const factionsText =
    families.length === 0
      ? "Random"
      : families.length === 1
        ? "1 named — every wave"
        : `${families.length} named`;
  const mutatorsText =
    tierMutationCount(tier) === 0
      ? `None at ${rungLabel(tier)}`
      : mutators.length === 0
        ? `${tierMutationCount(tier)} rolled`
        : mutators.length === 1
          ? (mutationById(mutators[0])?.name ?? "1 named")
          : `${mutators.length} named`;
  /**
   * Was the run under way started on a map the game picked? Read when the
   * run settles (grantRunReward), which is the one moment it pays.
   */
  const [runRandom, setRunRandom] = useState(false);
  /**
   * ...AND WHICH MODE IT WAS DEPLOYED IN. Separate from `mode` above,
   * which is the MENU's setting and is free to move while a run is on:
   * what a finished run pays is decided by the mode it was started in.
   */
  const [runMode, setRunMode] = useState<GameMode>(GAME_MODE_DEFAULT);
  // the selector draws map previews, so the documents load with the menu —
  // Game.create re-fetches later, keeping in-game state just as fresh
  const [mapsReady, setMapsReady] = useState(false);
  // SANDBOX MODE, hidden until Ctrl+Shift+S on any run: lifts the stage
  // gate and the price of every placement (Game.setTech(null)) and opens
  // the wave jump, so a run can be staged for filming. Leaving it drops
  // back to whatever the save allows (see the effect below).
  // It used to widen a pace strip as well; there is no pace to widen any
  // more — see the jump's own note for why the multipliers went.
  const [admin, setAdmin] = useState(false);
  /** what is typed into the sandbox's wave field, as typed — a string so
   *  the field can be EMPTY, which "0" is not: a number state would put a
   *  zero in the box the moment it was cleared and make it unclearable */
  const [skipField, setSkipField] = useState("");
  /**
   * THE WAVE THAT FIELD IS ASKING FOR, or null when what is typed is not a
   * wave this run can jump to. Both limits are the sim's own
   * (Sim.skipToWave): FORWARD ONLY, because no ledger here runs backwards,
   * and no further than the script's last wave. Derived rather than
   * validated on change, so the Skip button and the sim never disagree
   * about whether a number is a jump.
   */
  const skipTarget = ((): number | null => {
    if (!hud || skipField.trim() === "") return null;
    const n = Math.floor(Number(skipField));
    if (!Number.isFinite(n)) return null;
    return n > hud.currentWave && n <= hud.totalWaves ? n : null;
  })();
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
   *  every level, so there is always somewhere for it to land.
   *  IN REGULAR MODE ONLY: custom opens the whole ladder (GameMode), so
   *  the clamp also fires the moment a player flips back to regular
   *  standing on a rung the track has not reached */
  useEffect(() => {
    if (mode === "regular" && !difficultyOpen(playLevel, tierMutationCount(tier)))
      setTier(TOP_RULELESS_TIER);
  }, [playLevel, tier, mode]);
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
   * Is the frame counter up? A saved preference (Progress.showFps) like
   * `effects`, and the one knob on the Video tab that defaults to OFF: it
   * answers "is this machine keeping up", which is a question a player asks
   * when something already feels wrong, not a readout to have sitting over
   * the field of every run.
   *
   * It needs nothing from Game — the number is already on the HUD poll
   * (UiState.fps) — so the switch is only ever this flag.
   */
  const [showFps, setShowFps] = useState(false);
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
  const [invertZoom, setInvertZoom] = useState(INVERT_ZOOM_DEFAULT);
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

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setTier(p.difficulty ?? 0);
    setMapPick(p.map ?? null);
    setMode(p.mode ?? GAME_MODE_DEFAULT);
    setFamilies(p.families ?? []);
    setMutators(p.mutators ?? []);
    setEffects(p.effects ?? true);
    setShowFps(p.showFps ?? false);
    setUiScale(p.uiScale ?? UI_SCALE_DEFAULT);
    setPanSpeed(p.panSpeed ?? PAN_SPEED_DEFAULT);
    setInvertZoom(p.invertZoom ?? INVERT_ZOOM_DEFAULT);
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

  /**
   * THE SANDBOX DOOR, and it opens on any run, regular or custom.
   *
   * There is no Sandbox tab on the admin page any more: deploy whatever
   * run you like and press this for what the tab was (the whole tech
   * tree, every placement free, every pace). It is a debug tool, not a
   * mode — a regular run toggled into it still settles the way it was
   * deployed (grantRunReward), and that is the player's own business.
   */
  useEffect(() => {
    if (screen !== "game") return;
    const onKey = (e: KeyboardEvent): void => {
      // ctrl OR cmd, same as AdminShortcut — Ctrl+Shift+S is the pair that
      // arrives on every platform (Cmd+Shift+S is the browser's save dialog)
      if ((!e.ctrlKey && !e.metaKey) || !e.shiftKey || e.code !== "KeyS") return;
      e.preventDefault();
      setAdmin((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

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
        carveTowerIcons(),
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
        // the controls, off the save for the same reason as the effects
        g.setPanSpeed(save.panSpeed ?? PAN_SPEED_DEFAULT);
        g.setInvertZoom(save.invertZoom ?? INVERT_ZOOM_DEFAULT);
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
        // THE HAIRLINE DIAGNOSTIC IS A CONSOLE CALL NOW. It used to be
        // armed by `&diag=1` on the admin Sandbox tab's handoff URL, and
        // that door is gone with the tab (custom mode replaced it, and a
        // mode picked on the deploy screen has no query string to carry
        // a flag on). On a dev build the running Game is
        // `window.__animechs`, so the same test is __animechs.diagnose()
        // at whatever moment of a run is worth measuring — which is more
        // than the fixed 2.5s mark ever gave.
        if (ADMIN_ENABLED) {
          const w = window as unknown as Record<string, unknown>;
          w.__animechs = g;
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
            wave: (i: number, tier = 0) => waveCost(WORLD.script[i], tierLevel(tier), tierBossHpScale(tier)),
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
        // ...and runMode decides whether any of it is BANKED: a custom
        // run settles into a results panel and nothing else
        const reward = grantRunReward(
          level.tier ?? 0,
          ui.wavesCleared,
          ui.totalWaves,
          ui.won,
          level.id,
          runRandom,
          runMode,
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
      /**
       * THE LAST MEASUREMENT OUTLIVES THE RUN, and is taken BEFORE the
       * teardown below — a destroyed Game is not a Game to ask questions
       * of. A run that was being profiled ends exactly when the numbers
       * matter most: the wave was hard, the core fell, and the handle
       * carrying the tally goes with it. Losing the reading at the moment
       * it is asked for is the same trap as a profiler that wipes itself
       * when you stop it, and it has already cost a real measurement once.
       */
      if (game) {
        const profile = game.profileFull();
        if (profile && profile.phases.some((p) => p.ms > 0))
          (window as unknown as Record<string, unknown>).__animechsLastProfile = {
            stats: game.stats(),
            profile,
            // ...and the block as text beside it, so the reading that
            // outlived the run can be pasted rather than unpicked out of
            // a devtools object (simreport.ts profileLines)
            text: profileLines(profile).join("\n"),
          };
      }
      game?.destroy();
      gameRef.current = null;
      setHud(null);
      setLoadUi(null);
      // drop the debug global too — a stale pointer to a destroyed Game
      // makes console probing silently act on the wrong instance
      const w = window as unknown as Record<string, unknown>;
      if (w.__animechs === game) delete w.__animechs;
    };
  }, [screen, level, runRandom, runMode]);

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
      // come off the deal, so a letter that used to drop a repeater must
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

  // (the pause BUTTON is gone with the pace strip; space is handled in
  //  Game's own key handler, and the menu holds the sim when it opens)

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
   * REMEMBER THE DEPLOY SCREEN, whichever macro was just touched. Every
   * pick is written together (progress.ts RunPick) because they are read
   * together on the next launch — and they are written on the PRESS
   * rather than on Start, so a player who picks a map and then quits
   * comes back to it.
   */
  const savePick = useCallback(
    (over: Partial<Parameters<typeof saveRunPick>[0]> = {}): void =>
      saveRunPick({ mode, difficulty: tier, map: mapPick, families, mutators, ...over }),
    [mode, tier, mapPick, families, mutators],
  );

  /**
   * START, from the macros as they stand — and the ONE place the two
   * modes actually part company (progress.ts GameMode).
   *
   * REGULAR TAKES ONE PICK, the difficulty. The map is rolled over
   * everything the track has opened, the families are rolled, and the
   * rules are rolled from the deck the track has dealt — so a save
   * inside the roster phase deploys clean however hard the rung it
   * picked. It is the only mode that banks anything.
   *
   * CUSTOM TAKES WHATEVER IS NAMED and rolls the rest: the picked map
   * (or Random over every map, locked ones included), the named
   * families, and the named rules — or, where nothing is named, the same
   * roll regular would make except over the WHOLE catalog, since the
   * track's deck is a campaign rule and custom is not the campaign.
   *
   * THE RULES ARE ROLLED HERE, ON THE PRESS, and this is the only place
   * they are rolled. As many as the difficulty asks for, costing no more
   * than the points it carries (both dials on the rung). A named
   * difficulty carries zero of each and so plays clean — and that holds
   * in custom too: rules ticked under Nemesis are DROPPED rather than
   * smuggled onto a rung the ladder has never priced them for.
   *
   * IT USED TO ROLL ON THE DEPLOY SCREEN, once per (map, difficulty), so
   * that the panel could show the roll before the press. Regular shows
   * nothing now — a run's rules are the run's news — so the roll waits
   * for the press, which is also what makes it a roll: a preview a
   * player could see was a preview a player could re-roll by touching a
   * macro. Custom shows everything, because in custom nothing is news.
   */
  const startRun = (): void => {
    const p = progress ?? loadProgress();
    const custom = mode === "custom";
    // the hat Random draws from: the campaign's own maps, or every map
    // there is when the run pays nothing for reaching one early
    const hat = custom ? WORLDS : WORLDS.filter((w) => worldLock(p, w.id) == null);
    // REGULAR NEVER READS THE MAP MACRO — its map is rolled, always. In
    // custom a remembered pick is taken as it stands, locks and all
    const picked = custom ? pickedWorld : null;
    const random = picked == null;
    const w = picked ?? hat[Math.floor(Math.random() * hat.length)] ?? WORLD;
    const rules = tierMutationCount(tier);
    const named = custom ? cleanMutations(mutators) : [];
    const roll =
      rules === 0
        ? []
        : named.length > 0
          ? named
          : rollMutations(
              tierMutationPoints(tier),
              rules,
              // THE DECK IS WHAT THE TRACK HAS OPENED — in regular mode.
              // Past the roster phase every level puts one more rule in
              // the bag (MUTATOR_UNLOCKS); everything still locked is
              // kept out of the draw. Custom draws from all of it.
              custom ? [] : lockedMutators(effectiveLevel(p)),
            );
    savePick();
    setRunRandom(random);
    setRunMode(mode);
    // the family die is rolled inside runSpec, against the script it is
    // dealt into — see there for why it cannot be rolled out here. The
    // custom hand goes the same way, and is empty in regular mode
    setLevel(runSpec(w, tier, roll, custom ? families : []));
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
                    body: "Resources, tech and every cleared tier go back to nothing. This cannot be undone.",
                    confirmLabel: "Wipe",
                  });
                  if (ok) {
                    resetProgress();
                    const p = loadProgress();
                    setProgress(p);
                    // the deploy screen goes back to a fresh save's own:
                    // regular, Incursion, everything rolled
                    setTier(0);
                    setMapPick(null);
                    setMode(GAME_MODE_DEFAULT);
                    setFamilies([]);
                    setMutators([]);
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

            {/* THE COUNTER THE SWITCH ABOVE IS ANSWERED BY: turn the
                dressing off, watch the number, and the question is settled
                on this one panel rather than by feel. It stands in the
                top-right corner of the field (below) and nowhere else — the
                menus are not the thing whose frame rate is ever in doubt. */}
            <SettingRow label="FPS counter">
              <button
                aria-pressed={showFps}
                onClick={() => {
                  const next = !showFps;
                  setShowFps(next);
                  saveShowFps(next); // a preference about the device, like Effects
                }}
                className="ms-btn w-16 shrink-0 px-3 py-1.5 text-[15px]"
              >
                {showFps ? "On" : "Off"}
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
              // the knob that resizes the panel the knob is on — see
              // StepSlider.settleOnRelease
              settleOnRelease
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
            {/* WHICH WAY THE WHEEL ZOOMS. The wheel's own sign is not a
                fact about what the player meant by the flick: macOS's
                "natural scrolling" flips deltaY for mice as well as
                trackpads, and nothing the page can read says whether it
                is on. So the field ships the web convention — wheel down
                zooms out — and this is the switch for the machines where
                that comes out backwards. */}
            <SettingRow label="Reverse mouse zoom">
              <button
                aria-pressed={invertZoom}
                onClick={() => {
                  const next = !invertZoom;
                  setInvertZoom(next);
                  saveInvertZoom(next); // remembered across sessions
                  gameRef.current?.setInvertZoom(next); // live, mid-run
                }}
                className="ms-btn w-16 shrink-0 px-3 py-1.5 text-[15px]"
              >
                {invertZoom ? "On" : "Off"}
              </button>
            </SettingRow>
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
                      The name is one word: it is the COLOUR that splits ANI
                      from MECHS, not a space or a line break. */}
                  <h1 className="font-display text-5xl font-bold uppercase tracking-[0.02em] [text-shadow:4px_4px_0_#000] sm:text-6xl">
                    <span className="text-[#EDEDEF]">Ani</span>
                    <span className="text-[#FFD37F]">
                      mechs
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

            {/* THE DEPLOY SCREEN. The mode, the macros that mode offers,
                and Start under them. There is no map grid and no deploy
                dialog: every pick is one press away, and the defaults
                (Regular, Incursion) are a run in themselves */}
            {menuView === "deploy" && (
              <>
                <div className="flex w-full max-w-[28rem] flex-col gap-3">
                  {/* THE MODE, ABOVE EVERYTHING, as a segmented control and
                      not a list: there are two of them, they are the frame
                      every macro under here hangs in, and a control that
                      has to be opened to say which one it is on is the
                      wrong control for two words.
                      NOTHING EXPLAINS THEM UNDER IT. A paragraph saying
                      what each mode hands over is a paragraph describing
                      the rows directly beneath it, which say it better by
                      being there: regular shows one macro and custom four.
                      The one thing the rows cannot show is the price, and
                      that rides in the difficulty row's own XP slot */}
                  <div role="group" aria-label="Mode" className="ms-seg w-full">
                    {(
                      [
                        ["regular", "Regular"],
                        ["custom", "Custom"],
                      ] as ReadonlyArray<[GameMode, string]>
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        aria-pressed={mode === m}
                        onClick={() => {
                          setMode(m);
                          savePick({ mode: m });
                        }}
                        className="ms-btn flex-1 py-2.5 text-[15px]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* THE MACROS: what the next run is, as rows that read as
                      a sentence — this map, at this difficulty, against
                      these — and, in regular mode, what it pays in the XP
                      colour, so the trade is on the screen before any list
                      is opened. REGULAR SHOWS ONE ROW: its map, its swarm
                      and its rules are not picks, and a row saying
                      "Random, and you cannot change it" is a row about
                      nothing */}
                  <div className="flex flex-col gap-2">
                    {mode === "custom" && (
                      <MacroButton
                        label="Map"
                        value={pickedWorld ? pickedWorld.name : "Random"}
                        onClick={() => setPicker("maps")}
                      >
                        <span className="text-[#EDEDEF]">
                          {pickedWorld ? pickedWorld.name : "Random"}
                        </span>
                      </MacroButton>
                    )}
                    <MacroButton
                      label="Difficulty"
                      value={`${rungLabel(tier)}, ${
                        mode === "regular" ? xpShareText(tierXpBonus(tier)) : "no XP"
                      }`}
                      onClick={() => setPicker("difficulty")}
                    >
                      <span style={{ color: rungColor(tier) }}>{rungLabel(tier)}</span>
                      {/* WHAT THE RUN IS WORTH, in the slot it is worth it
                          in: the rung's share of the pot in regular, and
                          the whole of what custom mode costs in custom —
                          greyed, because it is the absence of the number
                          beside it */}
                      {mode === "regular" ? (
                        <span className="text-[14px]" style={{ color: XP_COLOR }}>
                          {xpShareText(tierXpBonus(tier))}
                        </span>
                      ) : (
                        <span className="text-[14px] text-[#71717C]">No XP</span>
                      )}
                    </MacroButton>
                    {mode === "custom" && (
                      <MacroButton
                        label="Factions"
                        value={factionsText}
                        onClick={() => setPicker("factions")}
                      >
                        <span className="text-[#EDEDEF]">{factionsText}</span>
                      </MacroButton>
                    )}
                    {/* THE MUTATOR ROW ONLY EXISTS WHERE THERE ARE RULES TO
                        PICK. Under Nemesis +1 the difficulty rolls none at
                        all (ladder.ts), so there is nothing for the list to
                        hold — the row says which difficulties have one
                        rather than opening onto an empty promise */}
                    {mode === "custom" && (
                      <MacroButton
                        label="Mutators"
                        value={mutatorsText}
                        onClick={() => tierMutationCount(tier) > 0 && setPicker("mutators")}
                      >
                        <span
                          className={
                            tierMutationCount(tier) > 0 ? "text-[#EDEDEF]" : "text-[#71717C]"
                          }
                        >
                          {mutatorsText}
                        </span>
                      </MacroButton>
                    )}
                  </div>
                  {/* NOTHING ON A REGULAR DEPLOY SAYS WHAT THE RUN WILL BE
                      PLAYED UNDER. The roll used to sit under the macros as
                      a row of faces, which meant the deploy screen answered
                      the question the first wave is supposed to: a player
                      read the rules, weighed them and re-picked the map to
                      re-roll them. The rules are a thing the run tells you,
                      not a thing the menu offers — they are on the HUD
                      (hudRules) from the first frame of the field, and the
                      codex on the progress screen says what each one does.
                      Custom is the exception and is meant to be: there,
                      the rules are the thing being tested */}
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
                savePick({ map: id });
                setPicker(null);
              }}
            />
          )}
          {picker === "difficulty" && (
            <DifficultyPicker
              tier={tier}
              // the body count on the detail pane is the PICKED map's, and
              // only custom mode has one — regular's is rolled on Start
              world={mode === "custom" ? pickedWorld : null}
              level={playLevel}
              custom={mode === "custom"}
              onClose={() => setPicker(null)}
              onPick={(t) => {
                setTier(t);
                savePick({ difficulty: t });
                setPicker(null);
              }}
            />
          )}
          {/* THE TWO CUSTOM LISTS. Both stay open while a hand is built
              (PickerDialog's footer is their way out) and both write on
              every toggle, so a hand survives a quit the same way a map
              pick does */}
          {picker === "factions" && (
            <FactionPicker
              picked={families}
              onClose={() => setPicker(null)}
              onSet={(f) => {
                setFamilies(f);
                savePick({ families: f });
              }}
            />
          )}
          {picker === "mutators" && (
            <MutatorPicker
              picked={mutators}
              tier={tier}
              onClose={() => setPicker(null)}
              onSet={(ids) => {
                setMutators(ids);
                savePick({ mutators: ids });
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
                  {unitName(b.kind)}
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
            {/* THE SHELF (components/Relics.tsx), over everything else the
                corner says — the run's relics and then its mods. A relic
                is a RULE in force for the rest of the run, so it heads the
                corner that holds what is true of the run for good. */}
            <RelicShelf relics={hud.shelfRelics} mods={hud.shelfMods} />
            {/* THE OBJECTIVE LINES, on the missions that have an objective
                BESIDE the waves. A hold and a survive get none: what those
                two ask is the thing the player is already doing, and a
                panel saying "clear every wave" over a board clearing every
                wave is furniture. An intercept is the other case — the
                count it is kept to is the only place the run's real state
                is written down, and nothing else on the screen would ever
                say it. */}
            {hud.mission.kind === "intercept" && !hud.lost && !hud.won && (
              <ObjectivePane hud={hud} />
            )}
            {admin && !hud.lost && !hud.won && !hud.menuOpen && (
              /* THE SANDBOX'S ONE CONTROL: the wave jump.
                 THE PACE STRIP IS GONE, and with it every multiplier. A
                 fast-forward is a promise the sim cannot keep on the waves
                 anyone wanted it for — at 2x a step has to fit in half a
                 frame, which above a couple of thousand bodies it does
                 not, so SIM_STEPS_MAX starts discarding owed time and the
                 run plays SLOWER than 1x while drawing at twenty frames.
                 It said nothing while doing it, which cost a day of
                 chasing a 50ms step that was only ever the multiplier.
                 The pause button went with the strip: space does it, and
                 so does the gear (the menu holds the sim the moment it
                 opens) — it was a third way to do a thing with two.
                 WHAT THE MULTIPLIERS WERE FOR was reaching wave forty to
                 look at wave forty, and running the first thirty-nine at
                 speed is a slow, approximate way of doing that: the fight
                 still has to be survived, and a sim stepped several times
                 a frame is not the sim a real run plays. This asks for the
                 wave directly.
                 A FORM rather than a button beside a field, so ENTER out
                 of the box does the thing the box is for — and the button
                 says where it is going rather than "Go", because the
                 number is typed above the field's own placeholder and the
                 two must not be read as one sentence.
                 AND IT IS GONE ON THE LAST WAVE, where there is nothing in
                 front of the run to jump to. A survive mission brings it
                 back by itself: its script loops and totalWaves grows
                 (Sim.loadStep), so the last wave stops being the last
                 one. */
              hud.currentWave < hud.totalWaves && (
              <form
                aria-label="skip to wave"
                onSubmit={(e) => {
                  e.preventDefault();
                  const g = gameRef.current;
                  if (!g || !skipTarget) return;
                  g.skipToWave(skipTarget);
                  // the field empties behind the jump: what it held is on
                  // the wave panel now, and a target already reached is a
                  // press that would do nothing the second time
                  setSkipField("");
                  setHud(g.ui());
                }}
                className="ms-seg self-start"
              >
                <span className="flex items-center px-2 text-[15px] uppercase tracking-widest text-[#71717C]">
                  Wave
                </span>
                <input
                  type="number"
                  min={hud.currentWave + 1}
                  max={hud.totalWaves}
                  step={1}
                  inputMode="numeric"
                  aria-label="wave to skip to"
                  /* the next wave up, so the box says what a jump is
                     measured from without putting a value in it */
                  placeholder={String(hud.currentWave + 1)}
                  value={skipField}
                  onChange={(e) => setSkipField(e.target.value)}
                  /* the run is listening on `window` for arrows, letters
                     and space (Game.onKeyDown, the build grid): every one
                     of those belongs to the caret while it is in here */
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-[4.5rem] border-0 bg-[#0B0B0D] px-2 py-1.5 text-right text-[15px] font-bold text-[#EDEDEF] placeholder:font-normal placeholder:text-[#4a4a52] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[#FFD37F] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  type="submit"
                  /* FORWARD ONLY, and never past the last wave the script
                     holds — the same two limits Sim.skipToWave enforces,
                     said here as a button that will not press rather than
                     as a press that quietly does nothing */
                  disabled={skipTarget === null}
                  title={
                    skipTarget === null
                      ? `A wave between ${hud.currentWave + 1} and ${hud.totalWaves}`
                      : `Skip to wave ${skipTarget} — the waves passed are not cleared`
                  }
                  className="ms-btn px-3 py-1.5 text-[15px] disabled:cursor-default disabled:opacity-40"
                >
                  Skip
                </button>
              </form>
              )
            )}
          </div>
        )}
        {/* THE TOP-RIGHT CORNER: the frame counter and the way into the
            menu, on one row, in that order — the readout takes the inside
            lane so the button keeps the exact corner it has always had, and
            the thumb does not have to learn a new spot the day the counter
            is switched on.
            The ROW stands for the whole run and each of the two decides for
            itself whether to draw. The gear goes when a screen that owns the
            frame is up (the end panels, the pause menu); the counter stays,
            because a player who turns it on from the pause overlay's own
            copy of Settings would otherwise press the switch and watch
            nothing happen. */}
        {hud && (
          <div className="ui-zoom absolute right-[1rem] top-[1rem] z-10 flex items-center gap-2">
            {/* WHAT THE DISPLAY IS ACTUALLY GETTING (UiState.fps) — the
                render loop's own smoothed rate and not the sim's pace, so a
                run at 8x still reads whatever the screen is drawing.
                It wears no pane, like the clock over the minimap: it is one
                number over the field, and a box round it would make it look
                like something to press. */}
            {showFps && (
              <div
                aria-label="frames per second"
                className="pointer-events-none select-none text-[15px] font-bold uppercase tracking-widest tabular-nums text-[#A1A1AA] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]"
              >
                {`${hud.fps} FPS`}
                {/* WHERE THE FRAME WENT, on the dev loop only. A player who
                    turns the counter on wants a number, not a profile, and
                    ADMIN_ENABLED is already the one switch that decides what
                    a shipped build has in it (game/env.ts) — so this folds
                    away in the static export exactly as the editors do.
                    SIM AND DRAW, not a total: the two are what compete for
                    this thread today, and reading them apart is the whole
                    point (a sim at 19ms and a draw at 5ms is a different
                    problem from the reverse, and the counter cannot tell
                    them apart). The body count rides along because neither
                    number means anything without the load behind it. */}
                {ADMIN_ENABLED && (
                  <span className="ms-2 font-normal normal-case tracking-normal text-[#71717A]">
                    {`sim ${hud.simMs.toFixed(1)} · draw ${hud.drawMs.toFixed(1)} · ${hud.bodies} · ${hud.host}`}
                    {/* ...and where the step went, when the clock is armed
                        (localStorage animechsProfile = "1", game.ts) */}
                    {hud.phases && <span className="ms-2">{`[${hud.phases}]`}</span>}
                  </span>
                )}
              </div>
            )}
            {!hud.lost && !hud.won && !hud.menuOpen && (
              /* the same menu esc raises — a pointer needs a way in too */
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
            )}
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
                families the die dealt this map (LevelSpec.families), as
                their first bodies — and every square above it is one
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
              {/* WHAT ACTUALLY WENT WRONG. An intercept is the first
                  mission that can be failed with the core still standing
                  (Sim.lost), so this headline stopped being a constant the
                  day it shipped: a run that let one Borer too many across
                  and is told its core was destroyed is being lied to about
                  the thing it has to do differently next time. */}
              <div className="font-display text-xl font-bold uppercase tracking-widest text-[#e55454]">
                {hud.coreHp > 0 ? "They got through" : "Core destroyed"}
              </div>
              <div className="mt-4 space-y-1 text-base text-[#EDEDEF]">
                {hud.mission.kind === "intercept" ? (
                  <div>
                    <span className="font-bold text-[#EDEDEF]">{hud.crossKilled}</span> of{" "}
                    {hud.mission.kills} destroyed,{" "}
                    <span className="font-bold text-[#EDEDEF]">{hud.crossLeaked}</span> past you
                  </div>
                ) : hud.mission.kind === "survive" ? (
                  <div>
                    Survived{" "}
                    <span className="font-bold text-[#EDEDEF]">{clock(hud.timeLeft)}</span> left
                    on the clock
                  </div>
                ) : (
                  /* NO WAVE NUMBERS ANYWHERE ON THIS SCREEN — a player is
                     not supposed to be able to count how many waves a
                     mission holds, so progress is a bar, not a fraction */
                  <div>
                    <div className="mb-1 text-[14px] uppercase tracking-widest text-[#71717C]">
                      Progress
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#3a1f1f]">
                      <div
                        className="h-full rounded-full bg-[#e55454]"
                        style={{
                          width: `${Math.min(
                            100,
                            (100 * hud.currentWave) / Math.max(1, hud.totalWaves),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {/* A CUSTOM RUN SAYS SO INSTEAD OF PRINTING A ZERO. The
                    run was played under rules its player chose, so it
                    banks nothing (progress.ts) — and a results panel that
                    simply left the XP block out would read as a bug the
                    first time somebody lost one */}
                {result?.custom ? (
                  <div className="pt-1 text-[14px] uppercase tracking-widest text-[#71717C]">
                    Custom run — no XP
                  </div>
                ) : (
                  result &&
                  result.xp > 0 && (
                    <div className="space-y-1 pt-1">
                      {/* the waves are the objectives, so a loss still pays
                          for every wave the board cleared on the way down —
                          which is what makes a failed push into progress */}
                      <div>Earned (×{result.xpBonus.toFixed(2)})</div>
                      <XpAmount amount={result.xp} className="justify-center" />
                      <LevelUpLine result={result} />
                    </div>
                  )
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
                {hud.mission.kind === "survive"
                  ? "Survived"
                  : hud.mission.kind === "intercept"
                    ? "Line cut"
                    : "Line held"}
              </div>
              <div className="mt-1 text-[14px] uppercase tracking-widest text-[#71717C]">
                <span style={{ color: rungColor(hud.tier) }}>{rungLabel(hud.tier)}</span> ·{" "}
                {missionText(level).title}
              </div>
              <div className="mt-4 space-y-1.5 text-base text-[#EDEDEF]">
                {hud.mission.kind === "intercept" && (
                  <div>
                    <span className="font-bold text-[#EDEDEF]">{hud.crossKilled}</span> destroyed,{" "}
                    <span className="font-bold text-[#EDEDEF]">{hud.crossLeaked}</span> past you
                  </div>
                )}
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {/* ...and the same on a win: a custom clear is not a
                    clear, it is not recorded on the map, and it pays
                    nothing (progress.ts grantRunReward) */}
                {result?.custom ? (
                  <div className="border-t-2 border-[#454545] pt-1.5 text-[14px] uppercase tracking-widest text-[#71717C]">
                    Custom run — no XP, not recorded
                  </div>
                ) : (
                  result && (
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
                  )
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
              <h2 className="ms-strip -mx-6 -mt-6 mb-1 self-stretch font-display text-lg font-bold uppercase text-[#FFD37F]">
                Paused
              </h2>
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
        {/* THE CONSOLE (backquote), in every build — see Console.tsx */}
        <GameConsole
          host={{
            game: () => gameRef.current,
            hud,
            sandbox: admin,
            setSandbox: setAdmin,
            admin: () => router.push(pathname.startsWith("/admin") ? "/" : "/admin"),
            fps: showFps,
            setFps: (on) => {
              setShowFps(on);
              saveShowFps(on);
            },
          }}
        />
      </div>
    </div>
  );
}
