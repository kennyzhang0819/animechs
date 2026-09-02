"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { loadLayoutDoc } from "@/game/layout";
import {
  loadLevelDocs,
  WORLD,
  WORLDS,
  worldById,
  waveGroups,
  MAP_BADGE,
  type LevelSpec,
  type TowerKind,
} from "@/game/levels";
import {
  audit,
  budget,
  check,
  grindTable,
  HP_PER_LEVEL,
  rungColor,
  rungLabel,
  RUNG_COUNT,
  specForTier,
  waveCost,
  waveGuide,
  tierDropBonus,
  tierLevel,
  tierMutationCount,
  tierMutationPoints,
} from "@/game/ladder";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import {
  clearedOn,
  grantRunReward,
  isTierCleared,
  loadProgress,
  isUnlocked,
  lockEverything,
  resetProgress,
  saveEffects,
  saveUiScale,
  UI_SCALE_DEFAULT,
  UI_SCALES,
  saveHudMinimized,
  unlockEverything,
  layoutFor,
  saveLayout,
  saveLoadout,
  saveSpeed,
  startingSpeed,
  techOf,
  topTier,
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
import { isEmpty, ITEM_INFO } from "@/game/items";
import { CostRow, Wallet } from "./Items";
import TechTree from "./TechTree";
import { useTouchOnly } from "./Board";
import { bandFor, MutationFace } from "./mutationFace";
import MenuBackground from "./MenuBackground";

/**
 * THE TOUCH BACK DOOR's three numbers (see `taps` in MechSwarm).
 *
 * Seven taps because that is Android's build-number count, and the count
 * being a known idiom is worth more than any number picked fresh. The
 * window is generous — a finger tapping deliberately is nowhere near a
 * double-click's cadence — and the hint appears at three, which is one
 * past anything a mis-tap plausibly reaches.
 */
const UNLOCK_TAPS = 7;
const UNLOCK_HINT_AT = 3;
const TAP_WINDOW_MS = 1200;

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
 * ONE MAP ON THE MAP SELECT — a preview, a name, and the badge that ranks
 * this map against the others (MAP_BADGE in levels.ts).
 *
 * The badge sits ON the preview rather than beside the name because that is
 * the thing being chosen between: a player scanning the grid is reading four
 * badges, not four sentences. Everything the map actually costs — the
 * rung, the wave count, the mutators rolled for it — is one tap deeper,
 * on the detail panel, so the grid stays a picture and never a spec sheet.
 */
function MapCard({
  world,
  progress,
  mapsReady,
  onPick,
}: {
  world: LevelSpec;
  progress: Progress;
  mapsReady: boolean;
  onPick: () => void;
}) {
  const badge = MAP_BADGE[world.badge ?? "beginner"];
  // how far up this map's OWN ladder the save has come. clearedOn counts
  // cleared levels, so reaching the count means the map is done
  const cleared = clearedOn(progress, world.id);
  const finished = cleared >= RUNG_COUNT;
  // WHAT IS STILL IN THE WAY, if anything. A locked card is dimmed, refuses
  // the click, and says the requirement in place of the clear count — a map
  // you cannot enter and cannot find out how to enter is a dead end
  const lock = worldLock(progress, world.id);
  const lockedBy = lock ? worldById(lock.world) : null;

  return (
    <button
      onClick={onPick}
      disabled={lock != null}
      aria-disabled={lock != null}
      className={`group ms-pane-solid flex flex-col overflow-hidden text-left transition-colors ${
        lock
          ? "cursor-not-allowed border-[#252525]"
          : "hover:border-[#FFD37F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FFD37F]"
      }`}
    >
      <div className={`relative ${lock ? "opacity-40 grayscale" : ""}`}>
        {mapsReady ? (
          <LevelThumb mapId={world.map ?? OFFICIAL_MAP_IDS[0]} bare />
        ) : (
          <div className="aspect-[16/9] bg-[#0b0b0d]" />
        )}
        <span className="ms-badge absolute left-2 top-2" style={{ color: badge.color }}>
          {badge.name}
        </span>
      </div>
      <div className="ms-rule-t flex items-baseline justify-between gap-3 px-3 py-2.5">
        <span
          className={`font-display text-[15px] font-bold uppercase tracking-widest ${
            lock ? "text-[#71717C]" : "text-[#EDEDEF] group-hover:text-[#FFD37F]"
          }`}
        >
          {world.name}
        </span>
        {lock ? (
          <span className="text-[11px] font-bold uppercase tracking-widest text-[#71717C]">
            Clear{" "}
            <span style={{ color: rungColor(lock.tier) }}>{rungLabel(lock.tier)}</span>{" "}
            on {lockedBy?.name ?? "the first map"}
          </span>
        ) : (
          <span
            className={`text-[11px] font-bold uppercase tracking-widest ${
              finished ? "text-[#7BE58A]" : "text-[#71717C]"
            }`}
          >
            {/* HOW FAR, NEVER HOW FAR OF WHAT. The card names the highest
                level this save has cleared here and nothing else — a
                denominator would tell a player on their first map exactly
                how long the climb is, which is a number the game is better
                for never printing. "Complete" is the only end-state, and by
                then they have earned knowing */}
            {finished
              ? "Complete"
              : cleared > 0
                ? `${rungLabel(cleared - 1)} cleared`
                : "New"}
          </span>
        )}
      </div>
    </button>
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
  // NO BODY COUNT. The line names the difficulty and the length of the run
  // and stops there: how many enemies are coming is the run's own answer to
  // give, wave by wave, and a total printed before the first one lands is a
  // number the player can do nothing with
  const { waves } = levelSummary(level);
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
        <div className="w-full">
          <LevelThumb mapId={level.map ?? OFFICIAL_MAP_IDS[0]} />
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          {/* the level has no name worth printing — one map, so the headline
              says what the screen is doing instead */}
          <h2 className="font-display text-3xl font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
            Loading
          </h2>
          <p className="text-[13px] uppercase tracking-widest text-[#71717C]">
            <span className="font-bold" style={{ color: rungColor(level.tier ?? 0) }}>
              {rungLabel(level.tier ?? 0)}
            </span>{" "}
            — {waves} waves
          </p>
        </div>
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
 * The campaign menu: one world, and the RUNG of its ladder to play it at.
 *
 * The frontier — the highest rung not yet cleared — is the default and the
 * headline, because it is the hardest run available and the one whose clear
 * opens the next. Stepping down is FARMING, and it is a real choice now
 * rather than a punishment: a lower rung is quicker and pays less, and the
 * whole gradient between them is LOOT_PER_RUNG. Nothing about a rung
 * changes what you may bring to it.
 */
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
 * colour on the border, same touch rule (the first tap opens the card),
 * because a player who has read the codex has already learned this
 * gesture. What it drops is the name under the square and the geometry
 * around it: this is a row inside a dialog, not a shelf on a board.
 *
 * THE CARD OPENS UPWARD. Everything below this row is the Deploy button
 * and the bottom of the panel, so a card hanging down would either be
 * clipped or would cover the one control the dialog exists to offer.
 */
function MutationChip({
  def,
  always,
  fromRight,
  touch,
  armed,
  onArm,
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
  touch: boolean;
  armed: string | null;
  onArm: (id: string | null) => void;
}) {
  const band = bandFor(def);
  // on touch the card follows `armed`, not the pointer: iOS does not
  // reliably focus a <button> it was tapped on, so hanging the card off
  // focus-within alone would leave taps opening nothing
  const showCard = touch && armed === def.id;
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`${def.name}: ${band.label} mutator${always ? ", always in force on this map" : ""}. ${def.blurb}`}
        onClick={() => onArm(armed === def.id ? null : def.id)}
        className="flex h-7 w-7 items-center justify-center border-2 bg-[#0b0b0d] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF8ACB]"
        style={{ borderColor: band.color }}
      >
        <MutationFace id={def.id} size="h-5 w-5" />
      </button>
      {/* what this rule does — opened by resting on the chip with a mouse,
          and by a tap with a finger */}
      <div
        className={`pointer-events-none absolute bottom-full z-10 mb-2 w-56 border-[3px] p-2.5 text-left shadow-lg ${
          fromRight ? "right-0" : "left-0"
        } ${showCard ? "block" : "hidden group-hover:block group-focus-within:block"}`}
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
 * THE MAP DIALOG — everything a run is chosen by, over the grid it was
 * chosen from.
 *
 * It used to be a fourth menu SCREEN, which cost a page transition each way
 * to say four numbers and pushed the grid out of sight, so comparing two
 * maps meant travelling. A dialog keeps the board behind it and closes back
 * onto the card that opened it.
 *
 * IT MUST NEVER SCROLL. Two columns — the map on the left, what the run is
 * on the right — and a body sized to fit a laptop and a held-sideways phone
 * alike. Anything that would need a scrollbar here belongs in the run or in
 * the tech tree instead: this is the last glance before Deploy, not a
 * briefing.
 */
function MapDialog({
  progress,
  world,
  tier,
  onTier,
  mapsReady,
  onStart,
  onClose,
}: {
  progress: Progress;
  /** which world's ladder is being picked from. Every world is on the menu
   * from the first run and each carries its own ladder, so this decides the
   * whole panel: which levels exist, which are cleared, which is the top */
  world: LevelSpec;
  tier: number;
  onTier: (t: number) => void;
  mapsReady: boolean;
  /** deploy, under exactly the mutators this panel has been showing */
  onStart: (mutation: readonly MutationId[]) => void;
  onClose: () => void;
}) {
  const top = topTier(progress, world.id);
  const spec = specForTier(world, tier);
  const { waves } = levelSummary(spec);
  const step = (d: number): void => onTier(Math.min(top, Math.max(0, tier + d)));
  // THE SALVAGE MULTIPLIER AS A MULTIPLE, not a percentage. It compounds
  // now (LOOT_PER_RUNG), so the top level is "x10.6" and a percentage there
  // would read as 963% — a number nobody can compare two of at a glance
  const loot = tierDropBonus(tier);
  // ...and the fight's own multiple beside it, which is the honest other
  // half of the trade: every body carries x1.06 health a level, and the
  // difficulty IS the level (tierLevel). The two are the whole decision, so
  // they sit side by side and are ALWAYS both shown — at difficulty 1 they
  // read x1.00, which is what makes the stepper legible
  const hpMult = HP_PER_LEVEL ** tierLevel(tier);
  const badge = MAP_BADGE[world.badge ?? "beginner"];
  const cleared = isTierCleared(progress, world.id, tier);
  /**
   * THE ROLL FOR THIS DEPLOY — as many rules as the difficulty asks for,
   * costing no more than the points it carries (tierMutationCount and
   * tierMutationPoints, both dials on the rung). Level 1 carries zero of
   * each and so rolls nothing; every step above it mutates.
   *
   * THE MAP HAS NO SAY IN THE ROLL, and one say beside it. What the tier
   * rolls is the tier's business on every world (the old per-world
   * `mutators` switch is long gone) — but a world may CARRY rules of its
   * own by design (LevelSpec.intrinsicMutation), and those are handed to
   * the roller as an exclusion so it cannot spend the tier's points on a
   * rule the run already plays under.
   *
   * IT IS ROLLED ONCE PER DIFFICULTY, HERE. Re-rolling on every render
   * would spin the list under the player's eyes; rolling at Deploy would
   * deploy rules that were never shown. Keying it on the tier is the
   * honest middle: step the difficulty and you are asking a different
   * question, so you get a different answer, and whatever the panel is
   * showing when Deploy is pressed is exactly what the run is played
   * under (onStart carries it).
   */
  const rolled = useMemo(
    () =>
      rollMutations(
        tierMutationPoints(tier),
        tierMutationCount(tier),
        world.intrinsicMutation ?? [],
      ),
    [world, tier],
  );
  /** what the run is played under, roll and level alike — the player's
   *  question is "what is true of this deploy", not "which half is which" */
  const mutations = mutationsInForce(world.intrinsicMutation, rolled)
    .map(mutationById)
    .filter((m): m is NonNullable<typeof m> => m !== null);
  const intrinsic = new Set(world.intrinsicMutation ?? []);
  // the chips' hover card follows the pointer on a mouse and `armed` on a
  // finger — the codex board's rule, for the same reason (see MutationChip)
  const touch = useTouchOnly();
  const [armed, setArmed] = useState<string | null>(null);

  // Escape closes it, like every dialog anyone has ever met
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    // the backdrop closes it too — a click outside a dialog means "not this
    // one", and on a phone it is a bigger target than any button
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={world.name}
        onClick={(e) => e.stopPropagation()}
        className="ui-zoom ms-pane-solid w-full max-w-[44rem] p-4 shadow-2xl"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* LEFT: the map itself, badged exactly as its card was, so the
              thing clicked and the thing opened are visibly the same */}
          <div className="relative self-start">
            {mapsReady ? (
              <LevelThumb mapId={spec.map ?? OFFICIAL_MAP_IDS[0]} bare />
            ) : (
              <div className="aspect-[16/9] bg-[#0b0b0d]" />
            )}
            <span className="ms-badge absolute left-2 top-2" style={{ color: badge.color }}>
              {badge.name}
            </span>
          </div>

          {/* RIGHT: the name, the one dial, and what the dial buys */}
          <div className="flex flex-col">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="truncate font-display text-lg font-bold uppercase tracking-[0.2em] text-[#EDEDEF]">
                {world.name}
              </h2>
              <span
                className={`shrink-0 text-[11px] font-bold uppercase tracking-widest ${
                  cleared ? "text-[#7BE58A]" : "text-[#FFD37F]"
                }`}
              >
                {cleared ? "Cleared" : "New"}
              </span>
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
                className="ms-btn h-9 w-9 p-0 text-lg"
              >
                −
              </button>
              <div className="text-center">
                {/* the level's NUMBER is the headline and the word above it
                    is the only label there is — and nothing sits under it,
                    because how long the ladder runs is not the player's to
                    know (see MapCard) */}
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#71717C]">
                  Difficulty
                </div>
                <div
                  className="text-2xl font-bold uppercase leading-none tracking-[0.15em]"
                  style={{ color: rungColor(tier) }}
                >
                  {rungLabel(tier)}
                </div>
              </div>
              <button
                aria-label="higher difficulty"
                disabled={tier >= top}
                onClick={() => step(1)}
                className="ms-btn h-9 w-9 p-0 text-lg"
              >
                +
              </button>
            </div>

            {/* THE WHOLE TRADE, AS THREE NUMBERS. Prose said the same thing
                in four lines and could not be compared between two levels at
                a glance; a row can. The wave count is here because it is the
                thing a player most needs to know is NOT what they are
                choosing — it is the same on every level */}
            <dl className="ms-rule-t mt-3 grid grid-cols-3 gap-2 pt-3 text-center">
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-[#71717C]">Waves</dt>
                <dd className="text-[15px] font-bold text-[#EDEDEF]">{waves}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-[#71717C]">Health</dt>
                <dd className="text-[15px] font-bold text-[#FF8A8A]">×{hpMult.toFixed(2)}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-[#71717C]">Loot</dt>
                <dd className="text-[15px] font-bold text-[#7BE58A]">×{loot.toFixed(2)}</dd>
              </div>
            </dl>

            {/* WHAT IS TRUE OF THE RUN rather than of the dial: every rule
                this deploy is played under — the ones the WORLD carries by
                design and the ones the difficulty ROLLED, as one row,
                because the player's question is "what is true of this
                deploy" and not "which half is which".

                A ROW OF FACES, NOT A PARAGRAPH. It used to spell each rule
                out in a sentence, which is four lines of prose in a dialog
                whose one question is yes-or-no, and which pushed Deploy
                further down the panel every time the stepper rolled
                another rule. A face is read at a glance and a repeat
                player already knows what it means; the sentence is one
                hover (or one tap) away for the player who does not, which
                is the codex board's own gesture, on purpose. */}
            {mutations.length > 0 && (
              <div className="mt-2 text-[12px] leading-snug">
                <div className="flex items-center gap-2">
                    <span className="font-bold uppercase tracking-widest text-[#FF8ACB]">
                      Mutators
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {mutations.map((m, i) => (
                        <MutationChip
                          key={m.id}
                          def={m}
                          always={intrinsic.has(m.id)}
                          fromRight={i >= mutations.length / 2}
                          touch={touch}
                          armed={armed}
                          onArm={setArmed}
                        />
                      ))}
                    </div>
                </div>
              </div>
            )}

            {/* ONE ACTION. The dialog asks a single question — this map,
                at this difficulty, yes or no — and the tech tree is on the
                grid one Escape behind, next to the wallet that pays for it,
                which is where a player who is not deploying is heading
                anyway */}
            {/* the gap is on the WRAPPER, not the button: padding on the
                button itself would push its own label off centre. mt-auto
                pins the row to the bottom of the column when the map beside
                it is the taller half, and pt-5 keeps daylight between the
                description and the one irreversible control on the panel */}
            <div className="mt-auto pt-5">
              <button
                onClick={() => onStart(rolled)}
                className="ms-btn ms-btn-accent w-full py-2.5 text-[13px] tracking-[0.3em]"
              >
                Deploy
              </button>
            </div>
          </div>
        </div>
      </div>
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
   * WHERE IN THE FRONT-OF-HOUSE THE PLAYER IS. The menu screen is four
   * panels, not one: a title card, settings, the map grid, and the picked
   * map's detail.
   *
   * The title card shows a game and two buttons and NOTHING else — no map,
   * no wallet, no difficulty. Everything that used to crowd it is a
   * property of a run, and a run has not been chosen yet; a start screen
   * that already displays a map has quietly made the choice for you. So
   * the resources and the ladder move behind Start, where they describe
   * something the player has actually pointed at.
   *
   * It is deliberately NOT part of `screen`: leaving a run or the tech tree
   * comes back to "menu" from several places, and this survives all of
   * them, so a player who deploys, loses, and backs out lands on the map
   * they were playing rather than at the title.
   */
  const [menuView, setMenuView] = useState<"home" | "settings" | "maps" | "map">("home");
  /**
   * THE BACK DOOR'S TAP COUNTER — how many times the settings heading has
   * been tapped in a row, and whether the door has been opened.
   *
   * The desktop debug modes are keyboard chords (Ctrl+Shift+S, Ctrl+Shift+M),
   * which an iPad cannot type, and the dev unlock is compiled out of the
   * build an iPad actually loads. This is the touch equivalent: seven taps
   * on the settings heading grants the whole tree (unlockEverything).
   *
   * THE COUNT IS SHOWN FROM THE THIRD TAP ON, which is what makes it a
   * secret rather than a puzzle: nothing advertises the gesture, but once
   * you are plainly in the middle of it the game stops making you guess
   * whether it is working. Android's build-number tap has made the same
   * trade for years.
   *
   * It resets on any pause longer than TAP_WINDOW_MS and on leaving the
   * screen, so a stray tap on the heading can never accumulate into an
   * unlock over the course of a session.
   */
  const [taps, setTaps] = useState(0);
  const lastTap = useRef(0);
  const [level, setLevel] = useState<LevelSpec | null>(null);
  /**
   * The rung the menu is pointed at. It follows the frontier whenever the
   * save advances — pushing is the default action and the frontier is the
   * only rung that still pays its first-clear bonus — but the player can
   * step it back down to farm a rung they already own.
   */
  const [tier, setTier] = useState(0);
  /**
   * The world the menu is pointed at. Every world is on the menu from the
   * first run (WORLD_REQUIRES is the one exception), and it is always
   * resolved through worldById so a stale id degrades to world 1.
   */
  const [worldId, setWorldId] = useState(WORLD.id);
  const world = worldById(worldId) ?? WORLD;
  // the selector draws map previews, so the documents load with the menu —
  // Game.create re-fetches later, keeping in-game state just as fresh
  const [mapsReady, setMapsReady] = useState(false);
  // sandbox mode, hidden until Ctrl+Shift+S like the admin page's
  // Ctrl+Shift+M: widens the pace strip to every SPEEDS multiplier AND
  // lifts the tech tree's turret locks and placement caps
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
   * Where the tech tree was opened FROM. A loss is the moment the tree is
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
  /**
   * THE IN-RUN SANDBOX DOOR'S TAP COUNTER — the touch equivalent of
   * Ctrl+Shift+S, seven taps on the pause overlay's heading.
   *
   * Same bargain and the same numbers as the settings door (see `taps`):
   * the chord is unreachable on a tablet, so the gesture is the only way
   * in there, and nothing advertises it. It lives on the PAUSE OVERLAY
   * rather than on the field because the field is covered in turret
   * targets — a tappable area over the map would be swallowing taps meant
   * for building — and because the sim is held while the overlay is up, so
   * a seven-tap gesture costs the player no waves.
   *
   * It resets whenever the overlay closes, with `pauseSettings`.
   */
  const [sandboxTaps, setSandboxTaps] = useState(0);
  const lastSandboxTap = useRef(0);

  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setTier(topTier(p, WORLD.id));
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
  }, [admin, worldId, level?.tier]);

  /**
   * THE PICKED RUNG BELONGS TO A WORLD, so switching worlds has to
   * re-clamp it. Each ladder is climbed separately: a save standing on rung
   * 8 here is standing on rung 1 next door, and leaving the number where it
   * was would point the menu at a rung that world has not opened. It lands
   * on the new world's own frontier, which is where a fresh pick belongs.
   */
  useEffect(() => {
    setTier(topTier(loadProgress(), worldId));
  }, [worldId]);

  useEffect(() => {
    let alive = true;
    // level documents overlay WORLDS in place (see levels.ts), so a script
    // edited in the admin level editor is what the menu counts and the run
    // plays. A level with no document keeps the campaign as shipped
    Promise.all([
      loadOfficialMaps(),
      loadLevelDocs(),
      loadBalanceDoc(),
      loadLayoutDoc(),
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
    window.history.replaceState(null, "", window.location.pathname);
    setWorldId(w.id);
    setTier(t);
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
        // stand this WORLD's board back up before the first wave — one
        // board a world now, whatever rung it was last built on, because
        // every turret on it is legal at every rung. Tech is applied first
        // because placeTower checks capacity, so restoring ahead of it
        // would silently drop everything past the default caps
        const saved = layoutFor(save, level.id);
        if (saved && saved.length > 0) g.applyLayout(saved);
        game = g;
        gameRef.current = g;
        setHud(g.ui());
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
            // the three compounding curves as one printable table — the
            // thing to read after touching LOOT_PER_RUNG or a wave cut
            grind: () => console.log(grindTable(WORLD)),
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
        // the pause menu should leave the last finished layout alone. It is
        // filed under the WORLD, so climbing a rung walks into the board
        // that won the one below it and farming a rung back down walks into
        // the same board again
        const built = g.layout();
        saveLayout(level.id, built);
        // level.id names the world the run was on — it keys the boss
        // trophies, so world 2's boss is a fresh trophy even at a rung
        // world 1's boss already paid
        const reward = grantRunReward(
          level.tier ?? 0,
          Array.from(g.sim.killsByKind),
          ui.won,
          level.id,
        );
        const after = loadProgress();
        setResult(reward);
        setProgress(after);
        // the run is over, so its sandbox is too — a retry from the results
        // panel starts on what the save actually owns (see `admin`)
        setAdmin(false);
        // the picker follows the frontier ONLY when the frontier moved. A
        // player farming rung 2 with a frontier of 7 has chosen that rung
        // and must not be yanked back up to 7 for clearing it again
        // (the board that won needs no handing forward any more: it is
        // already filed under this world, and the next rung stands it back
        // up as it is)
        if (reward.firstClear) setTier(topTier(after, reward.worldId));
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
    const unlockedList = ORDERED_MENU.filter(
      (t) => !hud.unlocked || hud.unlocked.includes(t.kind),
    ).map((t) => t.kind);
    if (hud.barSlots === null) return unlockedList;
    const picks = new Set(loadout ?? unlockedList);
    const chosen = unlockedList.filter((k) => picks.has(k));
    return (chosen.length > 0 ? chosen : unlockedList).slice(0, hud.barSlots);
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

  /**
   * THE PAUSE OVERLAY ALWAYS RE-OPENS ON ITS MENU, never on the settings a
   * previous pause left showing. It hangs off the overlay's own state
   * because Esc opens and closes it inside the sim (Game.onKeyDown) rather
   * than through openMenu below — a reset written into the button would be
   * a rule that only holds for players who use the button.
   */
  const menuOpen = hud?.menuOpen ?? false;
  useEffect(() => {
    if (!menuOpen) {
      setPauseSettings(false);
      setSandboxTaps(0); // a half-finished gesture never survives a close
    }
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
    // the run's spec is untouched — its world, its rung and the mutators
    // rolled for it when it was deployed. Nothing on the tech screen can
    // change any of the three, and a restart that re-rolled would hand a
    // player a fresh set of rules for losing under the old ones
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
    const saved = layoutFor(loadProgress(), level?.id ?? WORLD.id);
    if (saved && saved.length > 0) g.applyLayout(saved);
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
            {(
              [
                [UI_SCALES[0], "Compact"],
                [UI_SCALES[1], "Default"],
                [UI_SCALES[2], "Large"],
                [UI_SCALES[3], "XL"],
              ] as const
            ).map(([scale, label]) => (
              <button
                key={scale}
                aria-pressed={uiScale === scale}
                onClick={() => {
                  setUiScale(scale);
                  saveUiScale(scale); // remembered across sessions
                }}
                className="ms-btn px-3 py-1.5 text-[13px]"
              >
                {label}
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

          {/* THE DOOR, ONCE IT IS OPEN (see `taps`): shown only on a save
              that has used the back door — a save that went through it must
              never be stuck there. Nothing destructive: the grant was never
              written to the save (Progress.unlocked), so switching it off
              returns the campaign underneath untouched */}
          {!inGame && progress && isUnlocked(progress) && (
            <div className="ms-pane flex w-full max-w-[30rem] items-center justify-between gap-4 border-[#3A5A3F] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-bold uppercase tracking-widest text-[#7BE58A]">
                  Full unlock
                </div>
                <div className="text-[12px] text-[#71717C]">
                  Every tech node reads as owned
                </div>
              </div>
              <button
                onClick={() => {
                  const p = lockEverything();
                  setProgress(p);
                  setTier(topTier(p, worldId));
                  // the bar's curation may name turrets that only the
                  // grant was standing up; leave it filtering against
                  // a roster the save no longer owns and the bar comes
                  // back empty
                  setLoadout(p.loadout ?? null);
                }}
                className="ms-btn shrink-0 px-3 py-1.5 text-[13px]"
              >
                Disable
              </button>
            </div>
          )}

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
                    setTier(topTier(p, worldId));
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
      <TechTree
        progress={progress}
        onChanged={() => {
          const p = loadProgress();
          setProgress(p);
          // a turret's first point may have written itself into a curated
          // loadout (see buyTech) — keep the bar's mirror of the save honest
          setLoadout(p.loadout ?? null);
        }}
        // after a battle the two exits split: back leaves to the menu,
        // Restart (the labelled button beside it) re-runs with the tech
        // just bought. From the menu there is only the one way out.
        onBack={techFrom === "game" ? backToMenu : leaveTech}
        onRestart={techFrom === "game" ? leaveTech : undefined}
      />
    );
  }

  if (screen !== "game" || !level) {
    /**
     * THE WALLET AND THE WAY TO SPEND IT, as one strip. It is shown from
     * the map grid inwards and never on the title card: resources only
     * mean anything next to something to spend them on, and the last stop
     * before Deploy is exactly where a player wants the tech tree.
     */
    const bank = progress && (
      <div className="flex items-center gap-3">
        <span className="ms-pane flex items-center px-4 py-2">
          <Wallet bank={progress.bank} />
        </span>
        <button
          onClick={() => {
            setTechFrom("menu");
            setScreen("tech");
          }}
          className="ms-btn ms-btn-accent px-4 py-2 text-[13px]"
        >
          Upgrades
        </button>
      </div>
    );
    /**
     * THE ONE BACK BUTTON: icon only, big, pinned to the top-left of the
     * viewport — the same spot on every screen that has somewhere to go
     * back to, so the thumb never hunts for it. The label survives as the
     * accessible name.
     */
    const back = (label: string, to: "home" | "maps") => (
      <button
        aria-label={label}
        title={label}
        onClick={() => {
          // a half-finished back-door gesture does not survive the screen
          setTaps(0);
          setMenuView(to);
        }}
        className="ui-zoom ms-btn fixed left-[max(1rem,var(--safe-l))] top-[max(1rem,var(--safe-t))] z-20 h-11 w-11 p-0 text-[#a2a2a2] hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M14.7 5.1 7.8 12l6.9 6.9 1.7-1.7L11.2 12l5.2-5.2z" />
        </svg>
      </button>
    );
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
            view so walking Title → Start → a map never re-rolls it; only
            the wash over it changes — light on the title card, darker
            under the map grid, which is a thing to read */}
        <MenuBackground dim={menuView === "home" ? 0.38 : 0.66} />
        {/* ui-zoom off the title card: the hero screen is composed at one
            size; the working menus scale with the UI-size knob, which is
            also what makes the knob's effect visible where it lives */}
        <div
          className={`relative mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-8 py-12 pl-[max(1.5rem,var(--safe-l))] pr-[max(1.5rem,var(--safe-r))] sm:py-16 ${
            menuView === "home" ? "" : "ui-zoom"
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
                <p className="mb-2 text-[11px] uppercase tracking-[0.6em] text-[#a2a2a2] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                  Swarm defense
                </p>
                <h1 className="font-display text-5xl font-bold uppercase tracking-[0.08em] [text-shadow:0_3px_0_rgba(0,0,0,0.85),0_0_32px_rgba(0,0,0,0.9)] sm:text-6xl">
                  <span className="text-[#EDEDEF]">Mech</span>
                  <span className="text-[#FFD37F] [text-shadow:0_3px_0_rgba(0,0,0,0.85),0_0_28px_rgba(255,211,127,0.45)]">
                    Swarm
                  </span>
                </h1>
                {/* the rule under the name: Mindustry's dialog title
                    underline, an accent bar with the bevel's black under it */}
                <div className="mx-auto mt-3 h-[3px] w-40 bg-[#FFD37F] shadow-[0_3px_0_rgba(0,0,0,0.8)] sm:w-56" />
              </div>
              <div className="flex w-full max-w-[20rem] flex-col gap-3">
                <button
                  onClick={() => setMenuView("maps")}
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

          {/* SETTINGS - everything that changes the save rather than the run.
              Wiping is the only one so far, and it lives here rather than
              beside the Deploy button where a mis-tap would be costly */}
          {menuView === "settings" && (
            <>
              {/* THE HEADING IS THE BACK DOOR (see `taps`). It is a button
                  that does nothing visible for six taps, which is the whole
                  point — it has to be reachable on a device with no
                  keyboard and invisible to a player who is not looking for
                  it. It lives HERE, on a screen with no canvas under it,
                  rather than on the build stamp that floats over every
                  screen: a tappable target in the corner of the field would
                  be swallowing taps meant for turrets */}
              <button
                onClick={() => {
                  const now = performance.now();
                  const n = now - lastTap.current > TAP_WINDOW_MS ? 1 : taps + 1;
                  lastTap.current = now;
                  if (n >= UNLOCK_TAPS) {
                    setTaps(0);
                    setProgress(unlockEverything());
                    return;
                  }
                  setTaps(n);
                }}
                className="ms-heading text-[15px] tracking-[0.35em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFD37F]"
              >
                Settings
              </button>
              {/* The countdown only, and only mid-gesture. Whether the
                  door is OPEN is not a message here — it is the panel
                  below, which is the thing that can also close it */}
              {taps >= UNLOCK_HINT_AT && (
                <p className="-mt-4 text-[12px] uppercase tracking-widest text-[#71717C]">
                  {UNLOCK_TAPS - taps} more
                </p>
              )}

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
              {back("Back", "home")}
            </>
          )}

          {/* THE MAP GRID. Every map is SHOWN, always — a locked one is on
              the board saying what opens it, never hidden. Nothing is bought
              to reach a map and nothing carries between them; each keeps its
              own ladder (see WORLD_REQUIRES for the one exception) */}
          {(menuView === "maps" || menuView === "map") && progress && (
            <>
              <h2 className="ms-heading text-[15px] tracking-[0.35em]">
                Select map
              </h2>
              {bank}
              <div className="grid w-full max-w-[46rem] gap-4 sm:grid-cols-2">
                {WORLDS.map((w) => (
                  <MapCard
                    key={w.id}
                    world={w}
                    progress={progress}
                    mapsReady={mapsReady}
                    onPick={() => {
                      setWorldId(w.id);
                      setMenuView("map");
                    }}
                  />
                ))}
              </div>
              {back("Title", "home")}
            </>
          )}

        </div>

        {/* THE PICKED MAP, as a dialog over the grid it was picked from. It
            sits OUTSIDE the zoom wrapper on purpose: `ui-zoom` is a CSS
            `zoom`, and a fixed backdrop inside one covers the scaled box
            rather than the viewport. The panel carries its own ui-zoom, so
            the UI-size knob still moves it */}
        {menuView === "map" && progress && (
          <MapDialog
            progress={progress}
            world={world}
            tier={tier}
            onTier={setTier}
            mapsReady={mapsReady}
            onClose={() => setMenuView("maps")}
            onStart={(mutation) => {
              setLevel(runSpec(world, tier, mutation));
              setScreen("game");
              // raised in the same batch as the screen switch, so the game
              // screen's FIRST paint is already covered - an effect would
              // run after that paint and let a frame of black canvas through
              setLoadUi({ step: firstLoadStep(), out: false });
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
          <div className="ms-pane absolute left-1/2 top-[30%] -translate-x-1/2 border-[#FFD37F] px-4 py-1.5 font-display text-base font-bold uppercase tracking-[0.3em] text-[#FFD37F] sm:top-[calc(1rem+var(--safe-t))]">
            Paused
          </div>
        )}
        {/* one thin bar per boss on the field, stacked top-centre and keyed
            by spawn id so a bar never trades places with its neighbour.
            pointer-events-none: it is a readout, never a control */}
        {hud && hud.bosses.length > 0 && (
          <div className="ui-zoom pointer-events-none absolute left-1/2 top-[calc(0.75rem+var(--safe-t))] z-10 flex w-[min(40vw,22rem)] -translate-x-1/2 flex-col gap-1.5">
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
          <div className="ui-zoom absolute left-[calc(1rem+var(--safe-l))] top-[calc(1rem+var(--safe-t))] flex w-80 max-w-[calc(100vw-8rem-var(--safe-l)-var(--safe-r))] flex-col items-stretch gap-2">
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
                    — Wave{" "}
                    <span className="font-bold text-[#EDEDEF]">{hud.currentWave}</span> /{" "}
                    {hud.totalWaves}
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
                  {!hudMin && (hud.livesMax > 1 || alive > 0) && (
                    <div className="text-[#71717C]">
                      {hud.livesMax > 1 && (
                        <>
                          Lives{" "}
                          <span
                            className="font-bold"
                            style={{
                              color:
                                hud.lives > hud.livesMax / 2
                                  ? "#7BE58A"
                                  : hud.lives > 1
                                    ? "#FFD37F"
                                    : "#FF5A5A",
                            }}
                          >
                            {hud.lives}
                          </span>{" "}
                          / {hud.livesMax}
                        </>
                      )}
                      {hud.livesMax > 1 && alive > 0 && <span className="mx-2">·</span>}
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
                    {/* what the run has banked so far, one stack per currency —
                        empty until the first kill, so it doesn't sit at "0" */}
                    <CostRow cost={hud.earned} />
                  </div>
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
            className="ui-zoom absolute right-[calc(1rem+var(--safe-r))] top-[calc(1rem+var(--safe-t))] flex items-start gap-2"
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
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(1rem+var(--safe-b))] overflow-x-auto pb-1 pl-[calc(1rem+var(--safe-l))] pr-[calc(1rem+var(--safe-r))]">
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
                  className={TOOL_BTN}
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
                className={`${TOOL_BTN} ms-btn-red ${hud.sellMode ? "" : "text-[#a2a2a2]"}`}
              >
                <svg viewBox="0 0 12 12" className="h-8 w-8 fill-current" aria-hidden="true">
                  <path d="M4.6 1.1h2.8l.6 1h2v1.2H2V2.1h2zM2.9 4.6h6.2l-.5 6.3H3.4z" />
                </svg>
                <span className="text-[11px] font-bold uppercase leading-none tracking-widest">
                  Sell
                </span>
              </button>
            )}
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
          <div className="ui-zoom ms-pane absolute bottom-[calc(6.25rem+var(--safe-b))] left-1/2 z-10 max-w-[calc(100vw-2rem)] -translate-x-1/2 p-3">
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
                  className="ms-btn ms-btn-accent w-full px-5 py-2 text-base"
                >
                  Upgrades
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
                  Levels
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
                <span style={{ color: rungColor(hud.tier) }}>{rungLabel(hud.tier)}</span>{" "}
                cleared
              </div>
              <div className="mt-4 space-y-1.5 text-base text-[#EDEDEF]">
                <div>
                  Kills <span className="font-bold text-[#EDEDEF]">{hud.kills}</span>
                </div>
                {result && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-2 border-[#454545] pt-1.5">
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
                    {/* the ladder runs out at RUNG_COUNT, so the last
                        first-clear has nothing above it to announce. What
                        counts as "last" is THIS WORLD'S top (topTier on the
                        world just played), so a clear never announces a rung
                        this world's menu will not show */}
                    {result.firstClear && (
                      <div className="pt-1 text-[12px] uppercase tracking-widest text-[#FFD37F]">
                        {progress && topTier(progress, result.worldId) > result.tier ? (
                          <>
                            <span style={{ color: rungColor(result.tier + 1) }}>
                              {rungLabel(result.tier + 1)}
                            </span>{" "}
                            unlocked
                          </>
                        ) : (
                          "Top of the ladder — every wave cleared"
                        )}
                      </div>
                    )}
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
              {/* THE HEADING IS THE SANDBOX DOOR (see `sandboxTaps`) — a
                  button that does nothing visible for six taps. On a keyboard
                  it is Ctrl+Shift+S and this is beneath noticing; on a tablet
                  it is the only way in */}
              <button
                onClick={() => {
                  const now = performance.now();
                  const n =
                    now - lastSandboxTap.current > TAP_WINDOW_MS ? 1 : sandboxTaps + 1;
                  lastSandboxTap.current = now;
                  if (n >= UNLOCK_TAPS) {
                    setSandboxTaps(0);
                    setAdmin((v) => !v);
                    return;
                  }
                  setSandboxTaps(n);
                }}
                className="font-display text-xl font-bold uppercase tracking-[0.3em] text-[#FFD37F] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFD37F]"
              >
                Paused
              </button>
              {/* the countdown only, and only mid-gesture — whether the door
                  is open is said by the row below, which is also what closes
                  it. Seven taps to leave would be a punishment */}
              {sandboxTaps >= UNLOCK_HINT_AT && (
                <p className="-mt-3 text-[12px] uppercase tracking-widest text-[#71717C]">
                  {UNLOCK_TAPS - sandboxTaps} more
                </p>
              )}
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
