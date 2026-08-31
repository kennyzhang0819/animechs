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
  UNIT_STATS,
  WORLD,
  WORLDS,
  worldById,
  waveGroups,
  MAP_BADGE,
  type LevelSpec,
  type TowerKind,
  type UnitKind,
} from "@/game/levels";
import {
  audit,
  budget,
  check,
  deepestDrop,
  grindTable,
  paysNewCurrency,
  rungColor,
  rungLabel,
  RUNG_COUNT,
  specForTier,
  waveCost,
  waveGuide,
  tierDropBonus,
  tierLevel,
} from "@/game/ladder";
import { drawThumb, loadMap, loadOfficialMaps, OFFICIAL_MAP_IDS } from "@/game/maps";
import {
  activeMutations,
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
import { mutationAt } from "@/game/mutation";
import { BY_MINDUSTRY_VALUE } from "@/game/tech";
import { isEmpty, ITEM_INFO, ITEM_KINDS } from "@/game/items";
import { CostRow, Wallet } from "./Items";
import TechTree from "./TechTree";

const unitIcon = (k: UnitKind): string => `/mindustry/sprites/units/${k}.png`;

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
      className={`flex aspect-[16/9] items-center justify-center overflow-hidden rounded${
        bare ? "" : " border border-[#2E2E36] bg-[#101013]"
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
 * rung, the wave count, the mutations in force — is one tap deeper,
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
  // cleared rungs, so reaching the rung count means the map is done
  const cleared = clearedOn(progress, world.id);
  const total = RUNG_COUNT;
  const finished = cleared >= total;
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
      className={`group flex flex-col overflow-hidden rounded border text-left transition-colors ${
        lock
          ? "cursor-not-allowed border-[#26262C] bg-[#121215]"
          : "border-[#2E2E36] bg-[#151518] hover:border-[#FFD37F] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
      }`}
    >
      <div className={`relative ${lock ? "opacity-40 grayscale" : ""}`}>
        {mapsReady ? (
          <LevelThumb mapId={world.map ?? OFFICIAL_MAP_IDS[0]} bare />
        ) : (
          <div className="aspect-[16/9] bg-[#101013]" />
        )}
        <span
          className="absolute left-2 top-2 rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur"
          style={{
            color: badge.color,
            borderColor: badge.color,
            backgroundColor: "#101013D9",
          }}
        >
          {badge.name}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-[#2E2E36] px-3 py-2.5">
        <span
          className={`text-[15px] font-bold uppercase tracking-widest ${
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
            {finished ? "Complete" : `${cleared}/${total} cleared`}
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
  const { waves, enemies } = levelSummary(level);
  // steps, not bytes: nothing here streams, so the bar fills a stage at a
  // time rather than pretending to a percentage it cannot know
  const done = LOAD_STEPS.indexOf(step) + 1;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={`absolute inset-0 z-20 flex items-center justify-center bg-[#101013] transition-opacity duration-[260ms] ${
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
          <h2 className="text-3xl font-bold uppercase tracking-[0.25em] text-[#EDEDEF]">
            Loading
          </h2>
          <p className="text-[13px] uppercase tracking-widest text-[#71717C]">
            <span className="font-bold" style={{ color: rungColor(level.tier ?? 0) }}>
              {rungLabel(level.tier ?? 0)}
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
 * picked rung, plus whichever mutation rules the save has switched
 * on (mutation.ts).
 *
 * The two are joined HERE and not in specForTier, because they answer
 * different questions and the audit arithmetic only wants one of them: a
 * rung is what the campaign sends, a mutation is what the player asked
 * the game to do about it. Everything ladder.ts counts stays true either
 * way — a mutation changes a wave after it spawns, never what spawns.
 */
const runSpec = (world: LevelSpec, tier: number): LevelSpec => ({
  ...specForTier(world, tier),
  mutation: activeMutations(loadProgress()),
});

function TierPicker({
  progress,
  world,
  tier,
  onTier,
  mapsReady,
  onStart,
}: {
  progress: Progress;
  /** which world's ladder is being picked from. Every world is on the menu
   * from the first run and each carries its own ladder, so this decides the
   * whole panel: which rungs exist, which are cleared, which is the top */
  world: LevelSpec;
  tier: number;
  onTier: (t: number) => void;
  mapsReady: boolean;
  onStart: () => void;
}) {
  const top = topTier(progress, world.id);
  const spec = specForTier(world, tier);
  const { waves } = levelSummary(spec);
  const step = (d: number): void => onTier(Math.min(top, Math.max(0, tier + d)));
  // THE SALVAGE MULTIPLIER AS A MULTIPLE, not a percentage. It compounds
  // now (LOOT_PER_RUNG), so the top rung is "x28" and a percentage there
  // would read as 2,733% — a number nobody can compare two of at a glance
  const loot = tierDropBonus(tier);
  // the currency this rung ADDS, on the two rungs that add one — plastanium
  // and phase fabric arrive partway up the ladder, and every other rung
  // simply pays a deeper share of what the rung below already paid
  const newDrop = paysNewCurrency(tier)
    ? ITEM_INFO[ITEM_KINDS[deepestDrop(tier)]].name.toLowerCase()
    : null;
  // whether this rung's cut of the script fields a boss kind — read from
  // the waves themselves, so the warning follows the boss if it moves
  // the mutation rules switched on for the next run, as their definitions
  const mutations = activeMutations(progress)
    .map(mutationAt)
    .filter((a): a is NonNullable<typeof a> => a !== null);
  const hasBoss = spec.script.some(
    (s) =>
      "wave" in s &&
      waveGroups(s.wave).some((g) =>
        g.counts.some((c, i) => c > 0 && UNIT_STATS[UNIT_KINDS[i]].boss),
      ),
  );

  return (
    // no card chrome: with one map in the game there is nothing to tell this
    // panel apart from, and the frame only boxed the map in
    <div className="w-full max-w-[30rem] p-4">
      {mapsReady && <LevelThumb mapId={spec.map ?? OFFICIAL_MAP_IDS[0]} bare />}
      {/* no level name: there is one map in the game, so naming it labelled
          the obvious. The clear badge is the whole row now */}
      <div className="mt-3 flex items-baseline justify-end">
        {isTierCleared(progress, world.id, tier) ? (
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
          {/* the rung's NUMBER is the headline and the word above it is the
              only label there is. There is nothing else to call a rung */}
          <div className="text-[11px] uppercase tracking-[0.3em] text-[#71717C]">
            Difficulty
          </div>
          <div
            className="text-2xl font-bold uppercase leading-none tracking-[0.15em]"
            style={{ color: rungColor(tier) }}
          >
            {rungLabel(tier)}
          </div>
          <div className="mt-0.5 text-[11px] uppercase tracking-[0.2em] text-[#4A4A55]">
            of {RUNG_COUNT}
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

      {/* the wave count and one sentence of what the rung means — the full
          numbers (enemy level, hp multiple, exact salvage) live in the run
          itself and the editor, not on the menu. NOTHING HERE TALKS ABOUT
          WHAT THE RUNG WILL ADMIT any more, because a rung admits
          everything the save owns */}
      <div className="mt-3 border-t border-[#2E2E36] pt-3 text-[13px] leading-snug">
        <span className="font-bold text-[#EDEDEF]">{waves} waves.</span>{" "}
        <span className="text-[#A6A6AF]">
          {tier === 0 ? (
            <>The swarm at base strength — every kill drops resources for the tech tree.</>
          ) : (
            <>
              Enemies have more health and shields, but pay{" "}
              <span className="font-bold text-[#7BE58A]">×{loot.toFixed(2)} loot</span>
              {newDrop && (
                <>
                  {" "}
                  and start dropping{" "}
                  <span className="font-bold text-[#FFD37F]">{newDrop}</span>
                </>
              )}
              .
              {hasBoss && (
                <>
                  {" "}
                  <span className="font-bold text-[#FF8A8A]">A powerful enemy</span> will
                  spawn.
                </>
              )}
            </>
          )}
        </span>
      </div>

      {/* WHAT THIS RUN IS PLAYED UNDER. An mutation is switched on in the
          tech tree, one screen away, and it stays on until it is switched
          off — so the last thing before Deploy has to say which rules are
          in force, or a player meets them again having forgotten they
          asked for them */}
      {mutations.length > 0 && (
        <div className="mt-3 border-t border-[#2E2E36] pt-3 text-[13px] leading-snug">
          <span className="font-bold uppercase tracking-widest text-[#FF8ACB]">
            Mutation
          </span>{" "}
          <span className="text-[#A6A6AF]">
            {mutations.map((a) => a.name).join(" · ")}
          </span>
        </div>
      )}

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
const TOOL_BTN =
  "flex h-[4.5rem] w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded border backdrop-blur focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]";


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
    // the tech screen is also where the mutation switches live, so the
    // restart this button promises has to pick up any that were flipped —
    // the run's own world and rung are untouched
    setLevel((lv) => (lv ? { ...lv, mutation: activeMutations(loadProgress()) } : lv));
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
        className="flex overflow-hidden rounded border border-[#2E2E36] bg-[#151518]"
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
            className={`px-5 py-2 text-[13px] font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FFD37F] ${
              settingsTab === tab
                ? "bg-[#222227] text-[#FFD37F]"
                : "text-[#71717C] hover:text-[#A6A6AF]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {settingsTab === "interface" && (
        <div className="flex w-full max-w-[30rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded border border-[#2E2E36] bg-[#151518] px-4 py-3">
          <div className="text-[13px] font-bold uppercase tracking-widest text-[#EDEDEF]">
            UI size
          </div>
          <div
            role="group"
            aria-label="UI size"
            className="flex overflow-hidden rounded border border-[#2E2E36]"
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
                className={`px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FFD37F] ${
                  uiScale === scale
                    ? "bg-[#222227] text-[#FFD37F]"
                    : "text-[#71717C] hover:bg-[#222227]/60 hover:text-[#A6A6AF]"
                }`}
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
          <div className="flex w-full max-w-[30rem] items-center justify-between gap-4 rounded border border-[#2E2E36] bg-[#151518] px-4 py-3">
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
              className={`w-16 shrink-0 rounded border px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                effects
                  ? "border-[#FFD37F] bg-[#222227] text-[#FFD37F] hover:bg-[#2B2B32]"
                  : "border-[#2E2E36] bg-[#151518] text-[#71717C] hover:border-[#4A4A55] hover:text-[#A6A6AF]"
              }`}
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
            <div className="flex w-full max-w-[30rem] items-center justify-between gap-4 rounded border border-[#3A5A3F] bg-[#151518] px-4 py-3">
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
                className="shrink-0 rounded border border-[#2E2E36] bg-[#222227] px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest text-[#A6A6AF] hover:border-[#7BE58A] hover:text-[#7BE58A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7BE58A]"
              >
                Disable
              </button>
            </div>
          )}

          {!inGame && (
            <div className="flex w-full max-w-[30rem] items-center justify-between gap-4 rounded border border-[#2E2E36] bg-[#151518] px-4 py-3">
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
                className="shrink-0 rounded border border-[#5A2A2A] bg-[#221718] px-3 py-1.5 text-[13px] font-bold uppercase tracking-widest text-[#FF8A8A] hover:border-[#FF5A5A] hover:text-[#FF5A5A] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FF5A5A]"
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
      <div className="fixed inset-0 flex items-center justify-center bg-[#101013]">
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
        className="ui-zoom fixed left-[max(1rem,var(--safe-l))] top-[max(1rem,var(--safe-t))] z-20 flex h-11 w-11 items-center justify-center rounded border border-[#2E2E36] bg-[#151518]/80 text-[#A6A6AF] backdrop-blur hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
          <path d="M14.7 5.1 7.8 12l6.9 6.9 1.7-1.7L11.2 12l5.2-5.2z" />
        </svg>
      </button>
    );
    const badge = MAP_BADGE[world.badge ?? "beginner"];

    return (
      // the title card is a SCREEN, not a page — nothing on it overflows,
      // so it must never bounce or scroll under a finger. The deeper menu
      // views hold lists and do scroll.
      <div
        className={`fixed inset-0 bg-[#101013] ${
          menuView === "home" ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {/* ui-zoom off the title card: the hero screen is composed at one
            size; the working menus scale with the UI-size knob, which is
            also what makes the knob's effect visible where it lives */}
        <div
          className={`mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-8 py-12 pl-[max(1.5rem,var(--safe-l))] pr-[max(1.5rem,var(--safe-r))] sm:py-16 ${
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
                <p className="mb-2 text-[11px] uppercase tracking-[0.6em] text-[#71717C]">
                  Swarm defense
                </p>
                <h1 className="font-display text-5xl font-bold uppercase tracking-[0.08em] sm:text-6xl">
                  <span className="text-[#EDEDEF]">Mech</span>
                  <span className="text-[#FFD37F] [text-shadow:0_0_28px_rgba(255,211,127,0.4)]">
                    Swarm
                  </span>
                </h1>
                <div className="mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-[#FFD37F]/60 to-transparent sm:w-56" />
              </div>
              <div className="flex w-full max-w-[20rem] flex-col gap-3">
                <button
                  onClick={() => setMenuView("maps")}
                  className="w-full rounded border border-[#FFD37F] bg-[#222227]/90 py-3.5 text-[15px] font-bold uppercase tracking-[0.3em] text-[#FFD37F] hover:bg-[#2B2B32] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Start
                </button>
                <button
                  onClick={() => setMenuView("settings")}
                  className="w-full rounded border border-[#2E2E36] bg-[#151518] py-3.5 text-[15px] font-bold uppercase tracking-[0.3em] text-[#A6A6AF] hover:border-[#4A4A55] hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  Settings
                </button>
              </div>
              {/* the inspiration credit moved to Settings — the hero screen
                  carries the game's own name and nothing else's */}
              <p className="text-center text-[13px] uppercase tracking-widest text-[#71717C]">
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
                className="text-[13px] font-bold uppercase tracking-[0.35em] text-[#71717C] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFD37F]"
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
          {menuView === "maps" && progress && (
            <>
              <h2 className="text-[13px] font-bold uppercase tracking-[0.35em] text-[#71717C]">
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

          {/* THE PICKED MAP: its badge and name, then the ladder panel that
              has always been the last thing before a run */}
          {menuView === "map" && progress && (
            <>
              <div className="flex flex-col items-center gap-2">
                <span
                  className="rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: badge.color, borderColor: badge.color }}
                >
                  {badge.name}
                </span>
                <h2 className="text-2xl font-bold uppercase tracking-[0.2em] text-[#EDEDEF]">
                  {world.name}
                </h2>
              </div>
              {bank}
              <TierPicker
                progress={progress}
                world={world}
                tier={tier}
                onTier={setTier}
                mapsReady={mapsReady}
                onStart={() => {
                  setLevel(runSpec(world, tier));
                  setScreen("game");
                  // raised in the same batch as the screen switch, so the game
                  // screen's FIRST paint is already covered - an effect would
                  // run after that paint and let a frame of black canvas through
                  setLoadUi({ step: firstLoadStep(), out: false });
                }}
              />
              {back("All maps", "maps")}
            </>
          )}
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
          <div className="ui-zoom pointer-events-none absolute left-1/2 top-[calc(0.75rem+var(--safe-t))] z-10 flex w-[min(40vw,22rem)] -translate-x-1/2 flex-col gap-1.5">
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
            not breathe in and out as counters change and the pace strip
            lines up under it. Everything inside wraps rather than widening
            it */}
        {hud && (
          <div className="ui-zoom absolute left-[calc(1rem+var(--safe-l))] top-[calc(1rem+var(--safe-t))] flex w-80 max-w-[calc(100vw-8rem-var(--safe-l)-var(--safe-r))] flex-col items-stretch gap-2">
            <div className="w-full rounded border border-[#2E2E36] bg-[#151518]/70 px-3 py-1.5 backdrop-blur">
              {/* the wave counter is what a run is read off, so the line
                  carries that and the rung and nothing else — the level
                  name is on the card that launched it. Minimized, this line
                  IS the panel: not even the next-wave countdown survives */}
              <div className="flex items-start justify-between gap-2">
                <div className="text-[13px] uppercase tracking-widest text-[#EDEDEF] break-words">
                  <span className="font-bold" style={{ color: rungColor(hud.tier) }}>
                    {rungLabel(hud.tier)}
                  </span>{" "}
                  — Wave{" "}
                  <span className="font-bold text-[#EDEDEF]">{hud.currentWave}</span> / {hud.totalWaves}
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
                  className="shrink-0 rounded px-1 text-[13px] leading-5 text-[#71717C] hover:bg-[#222227]/60 hover:text-[#EDEDEF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F]"
                >
                  <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                    {hudMin ? <path d="M6 3l4.5 5h-9z" /> : <path d="M6 9L1.5 4h9z" />}
                  </svg>
                </button>
              </div>
              {!hudMin && (
                <>
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
                className="flex self-start overflow-hidden rounded border border-[#2E2E36] bg-[#151518]/70 backdrop-blur"
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
                className={`${TOOL_BTN} ${
                  loadoutOpen
                    ? "border-[#FFD37F] bg-[#222227]/90 text-[#FFD37F]"
                    : "border-[#2E2E36] bg-[#151518]/70 text-[#A6A6AF] hover:border-[#4A4A55]"
                }`}
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
          <div className="ui-zoom absolute bottom-[calc(6.25rem+var(--safe-b))] left-1/2 z-10 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded border border-[#2E2E36] bg-[#151518]/95 p-3 backdrop-blur">
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
                          className={`flex h-12 w-12 items-center justify-center rounded border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFD37F] ${
                            inBar
                              ? "border-[#FFD37F] bg-[#222227]/90"
                              : full
                                ? "cursor-not-allowed border-[#2E2E36] bg-[#151518]/70 opacity-25"
                                : "border-[#2E2E36] bg-[#151518]/70 opacity-40 hover:opacity-75"
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
            <div className="ui-zoom w-80 max-w-[calc(100vw-2rem)] rounded border border-[#3A2430] bg-[#151518]/95 p-6 text-center">
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
            <div className="ui-zoom w-80 max-w-[calc(100vw-2rem)] rounded border border-[#1F3A2E] bg-[#151518]/95 p-6 text-center">
              <div className="text-xl font-bold uppercase tracking-widest text-[#7BE58A]">
                <span style={{ color: rungColor(hud.tier) }}>{rungLabel(hud.tier)}</span>{" "}
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
                  className="rounded border border-[#7BE58A] bg-[#14271C]/90 px-6 py-2 text-base font-bold uppercase tracking-widest text-[#7BE58A] hover:bg-[#1A3324] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#7BE58A]"
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
            <div className="ui-zoom flex max-h-[calc(100vh-2rem)] w-[30rem] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 overflow-y-auto rounded border border-[#2E2E36] bg-[#151518]/95 p-6">
              <div className="text-xl font-bold uppercase tracking-widest text-[#E8B45B]">
                Paused
              </div>
              {settingsPanel(true)}
              <div className="flex justify-center gap-3 pt-1">
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
